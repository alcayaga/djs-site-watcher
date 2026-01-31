const dns = require('dns');
// Spy on dns.promises.lookup BEFORE requiring SiteMonitor
// We need to make sure the spy is in place if SiteMonitor uses it at module level (it doesn't, it uses it in method)
const lookupSpy = jest.spyOn(dns.promises, 'lookup');

jest.mock('got');
const got = require('got');

const SiteMonitor = require('../src/monitors/SiteMonitor');

describe('SiteMonitor Security', () => {
    let siteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        siteMonitor = new SiteMonitor('test-monitor', { file: 'sites.json' });
    });

    it('should reject URLs with non-http/https protocols', async () => {
        await expect(siteMonitor.fetchAndProcess('ftp://example.com', 'body'))
            .rejects.toThrow('Invalid protocol');
        
        await expect(siteMonitor.fetchAndProcess('file:///etc/passwd', 'body'))
            .rejects.toThrow('Invalid protocol');
    });

    it('should reject URLs resolving to private IP addresses (SSRF)', async () => {
        lookupSpy.mockResolvedValue({ address: '192.168.1.1' });
        
        await expect(siteMonitor.fetchAndProcess('http://internal-service.local', 'body'))
            .rejects.toThrow('Private IP access denied');
    });

    it('should reject URLs resolving to loopback addresses', async () => {
        lookupSpy.mockResolvedValue({ address: '127.0.0.1' });
        
        await expect(siteMonitor.fetchAndProcess('http://localhost', 'body'))
            .rejects.toThrow('Private IP access denied');
    });

    it('should allow valid public URLs', async () => {
        lookupSpy.mockResolvedValue({ address: '93.184.216.34' }); // example.com
        got.mockResolvedValue({ body: '<html></html>' });

        await expect(siteMonitor.fetchAndProcess('http://example.com', 'body'))
            .resolves.not.toThrow();
    });
});