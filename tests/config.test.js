jest.mock('../src/storage');
const {
    ENV_DISCORDJS_BOT_TOKEN,
    ENV_DISCORDJS_APCHANNEL_ID,
    ENV_ALLOW_PRIVATE_IPS
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
});