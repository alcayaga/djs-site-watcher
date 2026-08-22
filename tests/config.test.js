jest.mock('../src/storage');

const {
    ENV_DISCORDJS_BOT_TOKEN,
    ENV_DISCORDJS_APCHANNEL_ID,
    ENV_ALLOW_PRIVATE_IPS,
    ENV_REQUEST_TIMEOUT,
    ENV_RETRY_LIMIT
} = require('../src/utils/constants');

/**
 * Test suite for the config module.
 */
describe('config', () => {
    /**
     * Before each test, reset the modules to ensure a clean state.
     */
    beforeEach(() => {
        jest.resetModules();
    });

    /**
     * Test case for loading environment variables.
     */
    it('should load environment variables', () => {
        process.env[ENV_DISCORDJS_BOT_TOKEN] = 'test-token';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = [ENV_DISCORDJS_BOT_TOKEN];
        const config = require('../src/config');
        expect(config[ENV_DISCORDJS_BOT_TOKEN]).toBe('test-token');
    });

    /**
     * Test case for loading settings from storage.
     */
    it('should load settings from storage', () => {
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({ interval: 10 });
        storage.SENSITIVE_SETTINGS_KEYS = [];
        const config = require('../src/config');
        expect(config.interval).toBe(10);
    });

    /**
     * Test case for DISCORDJS_APCHANNEL_ID.
     */
    it('should load DISCORDJS_APCHANNEL_ID from env', () => {
        process.env[ENV_DISCORDJS_APCHANNEL_ID] = 'ap-channel-id';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = [ENV_DISCORDJS_APCHANNEL_ID];
        const config = require('../src/config');
        expect(config[ENV_DISCORDJS_APCHANNEL_ID]).toBe('ap-channel-id');
    });

    /**
     * Test case for ALLOW_PRIVATE_IPS.
     */
    it('should load ALLOW_PRIVATE_IPS from env', () => {
        process.env[ENV_ALLOW_PRIVATE_IPS] = 'true';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = [ENV_ALLOW_PRIVATE_IPS];
        const config = require('../src/config');
        expect(config[ENV_ALLOW_PRIVATE_IPS]).toBe(true);
    });

    /**
     * Test case ensuring loaded monitors are not overwritten.
     */
    it('should prioritize loaded monitors over defaults', () => {
        const customMonitors = [{ name: 'CustomMonitor', enabled: true }];
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({ monitors: customMonitors });
        storage.SENSITIVE_SETTINGS_KEYS = [];
        const config = require('../src/config');
        expect(config.monitors).toEqual(customMonitors);
    });

    it('should load REQUEST_TIMEOUT and RETRY_LIMIT from env', () => {
        process.env[ENV_REQUEST_TIMEOUT] = '5000';
        process.env[ENV_RETRY_LIMIT] = '5';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = [];
        
        const config = require('../src/config');
        expect(config.requestTimeout).toBe(5000);
        expect(config.retryLimit).toBe(5);
    });

    it('should load requestTimeout and retryLimit from config file', () => {
        delete process.env[ENV_REQUEST_TIMEOUT];
        delete process.env[ENV_RETRY_LIMIT];
        
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({
            requestTimeout: 8000,
            retryLimit: 3
        });
        storage.SENSITIVE_SETTINGS_KEYS = [];
        
        const config = require('../src/config');
        expect(config.requestTimeout).toBe(8000);
        expect(config.retryLimit).toBe(3);
    });

    /**
     * Test case for loading UPTIME_KUMA_URL from environment variables.
     */
    it('should load UPTIME_KUMA_URL from env', () => {
        const { ENV_UPTIME_KUMA_URL } = require('../src/utils/constants');
        process.env[ENV_UPTIME_KUMA_URL] = 'http://kuma.example.com';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = [ENV_UPTIME_KUMA_URL];
        const config = require('../src/config');
        expect(config.uptimeKumaUrl).toBe('http://kuma.example.com');
    });

    /**
     * Test case for loading uptimeKumaUrl from settings.json.
     */
    it('should load uptimeKumaUrl from config file', () => {
        const { ENV_UPTIME_KUMA_URL } = require('../src/utils/constants');
        delete process.env[ENV_UPTIME_KUMA_URL];
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({
            uptimeKumaUrl: 'http://config-kuma.example.com'
        });
        storage.SENSITIVE_SETTINGS_KEYS = [];
        const config = require('../src/config');
        expect(config.uptimeKumaUrl).toBe('http://config-kuma.example.com');
    });

    /**
     * Test case to ensure config file precedence over environment variables for uptimeKumaUrl.
     */
    it('should prioritize uptimeKumaUrl from config file over env variable', () => {
        const { ENV_UPTIME_KUMA_URL } = require('../src/utils/constants');
        process.env[ENV_UPTIME_KUMA_URL] = 'http://env-kuma.example.com';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({
            uptimeKumaUrl: 'http://config-kuma.example.com'
        });
        storage.SENSITIVE_SETTINGS_KEYS = [ENV_UPTIME_KUMA_URL];
        const config = require('../src/config');
        expect(config.uptimeKumaUrl).toBe('http://config-kuma.example.com');
    });
});