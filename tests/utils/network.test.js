describe('Network Utils', () => {
    describe('getSafeGotOptions', () => {
        let getSafeGotOptions;

        beforeEach(() => {
            jest.resetModules();
            getSafeGotOptions = require('../../src/utils/network').getSafeGotOptions;
        });

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
        describe('with bypass active', () => {
            let isPrivateIP;
            beforeAll(() => {
                jest.resetModules();
                jest.doMock('../../src/config', () => ({
                    ALLOW_PRIVATE_IPS: true
                }));
                isPrivateIP = require('../../src/utils/network').isPrivateIP;
            });

            it('should return false for private IPs', () => {
                expect(isPrivateIP('127.0.0.1')).toBe(false);
            });
        });

        describe('with bypass inactive', () => {
            let isPrivateIP;
            beforeAll(() => {
                jest.resetModules();
                jest.doMock('../../src/config', () => ({
                    ALLOW_PRIVATE_IPS: false
                }));
                isPrivateIP = require('../../src/utils/network').isPrivateIP;
            });

            it('should return true for private IPs', () => {
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
});