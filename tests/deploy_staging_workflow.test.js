const fs = require('fs-extra');
const path = require('path');
const { execFileSync } = require('child_process');

describe('deploy-staging.yml workflow security and sanitization', () => {
  const workflowPath = path.join(__dirname, '../.github/workflows/deploy-staging.yml');
  let workflowContent;

  beforeAll(async () => {
    workflowContent = await fs.readFile(workflowPath, 'utf8');
  });

  it('workflow file should exist and contain required triggers', () => {
    expect(workflowContent).toBeDefined();
    expect(workflowContent).toContain('name: Deploy to Staging');
    expect(workflowContent).toContain('workflow_dispatch:');
    expect(workflowContent).toContain('workflow_run:');
    // Ensure workflow_dispatch can run only on master or when workflow_run succeeds from master push in same repo
    expect(workflowContent).toContain(
      "(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/master') || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'master' && github.event.workflow_run.head_repository.full_name == github.repository)"
    );
  });

  it('workflow must not contain hardcoded private IP addresses or personal usernames', () => {
    // Prevent information leakage in public repository
    expect(workflowContent).not.toMatch(/10\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(workflowContent).not.toMatch(/192\.168\.\d{1,3}\.\d{1,3}/);
    expect(workflowContent).not.toContain('home.alcayaga.net');
    expect(workflowContent).not.toContain('gemini-cli');
  });

  it('workflow must strictly source connection parameters from GitHub Secrets', () => {
    expect(workflowContent).toContain('${{ secrets.STAGING_WIREGUARD_CONFIG }}');
    expect(workflowContent).toContain('${{ secrets.STAGING_HOST }}');
    expect(workflowContent).toContain('${{ secrets.STAGING_USERNAME }}');
    expect(workflowContent).toContain('${{ secrets.SSH_PRIVATE_KEY }}');
  });

  it('workflow must implement secure cleanup and shredding in an always() condition', () => {
    expect(workflowContent).toContain('if: always()');
    expect(workflowContent).toContain('wg-quick down wg0');
    expect(workflowContent).toContain('shred -u');
  });

  it('workflow must create WireGuard config with mode 0600', () => {
    expect(workflowContent).toContain('install -m 600 -o root -g root /dev/null /etc/wireguard/wg0.conf');
  });

  it('workflow must pin all third-party actions to a full-length 40-character commit SHA', () => {
    const usesLines = workflowContent.split('\n').filter((line) => /^\s*(-\s+)?uses:/.test(line));
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line).toMatch(/uses:\s*[^\s@]+@[a-f0-9]{40}(\s+#.*)?\s*$/);
    }
  });

  describe('awk sanitization logic', () => {
    let extractedAwkScript;

    beforeAll(() => {
      // Extract the awk script directly from deploy-staging.yml to avoid duplication
      const match = workflowContent.match(/sudo awk -v host_ip="\$TARGET_IP" '([\s\S]*?)' \/etc\/wireguard\/wg0\.conf/);
      if (!match) {
        throw new Error('Could not extract awk sanitization script from deploy-staging.yml');
      }
      extractedAwkScript = match[1];
    });

    /**
     * Executes the workflow awk script on sample configuration content.
     *
     * @param {string} inputConfig - Raw WireGuard configuration.
     * @param {string} hostIp - Target host IPv4 address.
     * @returns {string} Sanitized WireGuard configuration.
     */
    function runAwkSanitization(inputConfig, hostIp) {
      return execFileSync('awk', ['-v', `host_ip=${hostIp}`, extractedAwkScript], {
        input: inputConfig,
        encoding: 'utf8',
      });
    }

    it('strips DNS lines to protect runner native DNS', () => {
      const input = [
        '[Interface]',
        'PrivateKey = abc',
        'Address = 10.0.0.2/24',
        'DNS = 10.0.0.1',
        '',
        '[Peer]',
        'PublicKey = def',
        'AllowedIPs = 10.0.0.0/24',
      ].join('\n');

      const result = runAwkSanitization(input, '10.0.0.1');
      expect(result).not.toContain('DNS');
      expect(result).toContain('Address = 10.0.0.2/24');
      expect(result).toContain('AllowedIPs = 10.0.0.1/32');
    });

    it('rewrites full-tunnel AllowedIPs to target host /32 to prevent runner disconnect', () => {
      const input = [
        '[Interface]',
        'PrivateKey = abc',
        'Address = 10.0.0.2/24',
        '',
        '[Peer]',
        'PublicKey = def',
        'AllowedIPs = 0.0.0.0/0, ::0/0',
      ].join('\n');

      const result = runAwkSanitization(input, '10.0.0.1');
      expect(result).not.toContain('0.0.0.0/0');
      expect(result).not.toContain('::0/0');
      expect(result).toContain('AllowedIPs = 10.0.0.1/32');
    });

    it('guarantees split-tunneling by enforcing target host /32 for any AllowedIPs setting', () => {
      const input = [
        '[Interface]',
        'PrivateKey = abc',
        'Address = 10.0.0.2/24',
        '',
        '[Peer]',
        'PublicKey = def',
        'AllowedIPs = 10.0.0.0/24, ::/0',
      ].join('\n');

      const result = runAwkSanitization(input, '10.0.0.1');
      expect(result).not.toContain('::/0');
      expect(result).toContain('AllowedIPs = 10.0.0.1/32');
    });
  });
});
