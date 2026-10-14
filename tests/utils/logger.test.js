const logger = require('../../src/utils/logger');

describe('logger masking', () => {
    it('should mask Discord tokens correctly', () => {
        const p1 = 'dummyTokenPartOne1234567';
        const p2 = 'dummy2';
        const p3 = 'dummySecretKeyPartThree12345678';
        const token = `${p1}.${p2}.${p3}`;
        const masked = logger.maskSensitive(`Failed token: ${token}`);
        expect(masked).not.toContain(token);
        expect(masked).toContain('************************.******.*******************************');
    });

    it('should mask sensitive query parameters including access_token', () => {
        const url = 'https://api.example.com/check?token=my_secret_token_123&other=val';
        const masked = logger.maskSensitive(`Request failed for ${url}`);
        expect(masked).not.toContain('my_secret_token_123');
        expect(masked).toContain('token=*******************');
        expect(masked).toContain('other=val');

        const oauthUrl = 'https://api.example.com/check?access_token=secret_oauth_token&type=user';
        const oauthMasked = logger.maskSensitive(`Request failed for ${oauthUrl}`);
        expect(oauthMasked).not.toContain('secret_oauth_token');
        expect(oauthMasked).toContain('access_token=******************');
    });

    it('should mask Bearer tokens', () => {
        const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
        const masked = logger.maskSensitive(`Error in auth: ${authHeader}`);
        expect(masked).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz');
        expect(masked).toContain('Bearer ************************************.***');
    });

    it('should return non-string inputs unchanged', () => {
        expect(logger.maskSensitive(null)).toBeNull();
        expect(logger.maskSensitive(123)).toBe(123);
        expect(logger.maskSensitive(undefined)).toBeUndefined();
    });
});
