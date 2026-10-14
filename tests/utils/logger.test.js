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

    it('should mask Discord tokens ending in a hyphen', () => {
        const p1 = 'dummyTokenPartOne1234567';
        const p2 = 'dummy2';
        const p3 = 'dummySecretKeyPartThree1234567-';
        const token = `${p1}.${p2}.${p3}`;
        const masked = logger.maskSensitive(`Failed token with hyphen: ${token}`);
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

        const apiKeyUrl = 'https://api.example.com/check?api-key=my_custom_api_key_456';
        const apiKeyMasked = logger.maskSensitive(`Request failed for ${apiKeyUrl}`);
        expect(apiKeyMasked).not.toContain('my_custom_api_key_456');
        expect(apiKeyMasked).toContain('api-key=*********************');

        const refreshUrl = 'https://api.example.com/oauth?refresh_token=secret_refresh_token_789&client_secret=secret_client_xyz';
        const refreshMasked = logger.maskSensitive(`OAuth error: ${refreshUrl}`);
        expect(refreshMasked).not.toContain('secret_refresh_token_789');
        expect(refreshMasked).not.toContain('secret_client_xyz');
        expect(refreshMasked).toContain('refresh_token=************************');
        expect(refreshMasked).toContain('client_secret=*****************');

        const hyphenUrl = 'https://api.example.com/oauth?refresh-token=hyphen_refresh_123&client-secret=hyphen_secret_456';
        const hyphenMasked = logger.maskSensitive(`OAuth error: ${hyphenUrl}`);
        expect(hyphenMasked).not.toContain('hyphen_refresh_123');
        expect(hyphenMasked).not.toContain('hyphen_secret_456');
        expect(hyphenMasked).toContain('refresh-token=******************');
        expect(hyphenMasked).toContain('client-secret=*****************');
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
