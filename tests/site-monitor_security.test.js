const dns = require('dns');
const { URL } = require('url');

// Spy on dns.lookup (callback style)
const lookupSpy = jest.spyOn(dns, 'lookup');

jest.mock('got', () => {
    return jest.fn((url, options) => {
        if (options && options.dnsLookup) {
            // Simulate DNS lookup execution by got
            const { URL } = require('url');
            const hostname = new URL(url).hostname;
            return new Promise((resolve, reject) => {
                options.dnsLookup(hostname, {}, (err, address, family) => {
                    if (err) return reject(err);
                    resolve({ body: '<html></html>' });
                });
            });
        }
        return Promise.resolve({ body: '<html></html>' });
    });
});

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
        lookupSpy.mockImplementation((hostname, options, cb) => cb(null, '192.168.1.1', 4));
        
        await expect(siteMonitor.fetchAndProcess('http://internal-service.local', 'body'))
            .rejects.toThrow('Private IP access denied');
    });

    it('should reject URLs resolving to loopback addresses', async () => {
        lookupSpy.mockImplementation((hostname, options, cb) => cb(null, '127.0.0.1', 4));
        
        await expect(siteMonitor.fetchAndProcess('http://localhost', 'body'))
            .rejects.toThrow('Private IP access denied');
    });

    it('should reject IPv6 loopback', async () => {
        lookupSpy.mockImplementation((hostname, options, cb) => cb(null, '::1', 6));
        
        await expect(siteMonitor.fetchAndProcess('http://[::1]', 'body'))
            .rejects.toThrow('Private IP access denied');
    });

    it('should allow valid public URLs', async () => {
        lookupSpy.mockImplementation((hostname, options, cb) => cb(null, '93.184.216.34', 4));

        await expect(siteMonitor.fetchAndProcess('http://example.com', 'body'))
            .resolves.not.toThrow();
    });
});