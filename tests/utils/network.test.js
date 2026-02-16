const { isPrivateIP, getSafeGotOptions } = require('../../src/utils/network');
const config = require('../../src/config');

describe('Network Utils', () => {
    describe('getSafeGotOptions', () => {
        it('should return default timeout and retry options', () => {
            const options = getSafeGotOptions();
            expect(options.timeout.request).toBe(10000);
            expect(options.retry.limit).toBe(2);
            expect(typeof options.dnsLookup).toBe('function');
            expect(options.hooks.beforeRequest).toHaveLength(1);
        });

        it('should block private IPs in beforeRequest hook', () => {
            const options = getSafeGotOptions();
            const beforeRequest = options.hooks.beforeRequest[0];
            
            const mockOptions = (hostname) => ({
                url: { hostname }
            });

            expect(() => beforeRequest(mockOptions('127.0.0.1'))).toThrow('SSRF Prevention');
            expect(() => beforeRequest(mockOptions('10.0.0.1'))).toThrow('SSRF Prevention');
            expect(() => beforeRequest(mockOptions('192.168.1.1'))).toThrow('SSRF Prevention');
            expect(() => beforeRequest(mockOptions('google.com'))).not.toThrow();
            expect(() => beforeRequest(mockOptions('8.8.8.8'))).not.toThrow();
        });
    });

    describe('isPrivateIP', () => {
        const originalNodeEnv = config.NODE_ENV;
        const originalAllowPrivateIps = config.ALLOW_PRIVATE_IPS;

        afterEach(() => {
            config.NODE_ENV = originalNodeEnv;
            config.ALLOW_PRIVATE_IPS = originalAllowPrivateIps;
        });

        it('should return false for private IPs when bypass is active in development', () => {
            config.NODE_ENV = 'development';
            config.ALLOW_PRIVATE_IPS = 'true';
            expect(isPrivateIP('127.0.0.1')).toBe(false);
        });

        it('should return false for private IPs when bypass is active in test', () => {
            config.NODE_ENV = 'test';
            config.ALLOW_PRIVATE_IPS = 'true';
            expect(isPrivateIP('127.0.0.1')).toBe(false);
        });

        it('should be case-insensitive for ALLOW_PRIVATE_IPS', () => {
            config.NODE_ENV = 'development';
            config.ALLOW_PRIVATE_IPS = 'TRUE';
            expect(isPrivateIP('127.0.0.1')).toBe(false);
        });

        it('should return true for private IPs when bypass is NOT active', () => {
            config.NODE_ENV = 'development';
            config.ALLOW_PRIVATE_IPS = 'false';
            expect(isPrivateIP('127.0.0.1')).toBe(true);
        });

        it('should return true for private IPs in production regardless of bypass', () => {
            config.NODE_ENV = 'production';
            config.ALLOW_PRIVATE_IPS = 'true';
            expect(isPrivateIP('127.0.0.1')).toBe(true);
        });

        it('should return true for private IPv4 addresses', () => {
            expect(isPrivateIP('127.0.0.1')).toBe(true);
            expect(isPrivateIP('10.0.0.1')).toBe(true);
            expect(isPrivateIP('192.168.1.1')).toBe(true);
            expect(isPrivateIP('172.16.0.1')).toBe(true); // 172.16.x.x is private
            expect(isPrivateIP('172.31.255.255')).toBe(true); // 172.31.x.x is private
            expect(isPrivateIP('169.254.1.1')).toBe(true);
        });

        it('should return true for private IPv6 addresses', () => {
            expect(isPrivateIP('::1')).toBe(true);
            expect(isPrivateIP('fc00::1')).toBe(true);
            expect(isPrivateIP('fd00::1')).toBe(true);
            expect(isPrivateIP('fe80::1')).toBe(true);
        });

        it('should return false for public IPv4 addresses', () => {
            expect(isPrivateIP('8.8.8.8')).toBe(false);
            expect(isPrivateIP('1.1.1.1')).toBe(false);
            expect(isPrivateIP('172.32.0.1')).toBe(false); // Outside 172.16.0.0/12 range
        });
        
        it('should return false for public IPv6 addresses', () => {
            expect(isPrivateIP('2606:4700:4700::1111')).toBe(false); // Cloudflare
        });
    });
});