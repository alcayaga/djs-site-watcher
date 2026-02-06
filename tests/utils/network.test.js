const { isPrivateIP } = require('../../src/utils/network');

describe('Network Utils', () => {
    describe('isPrivateIP', () => {
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