jest.mock('../src/storage');

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
        process.env.DISCORDJS_BOT_TOKEN = 'test-token';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = ['DISCORDJS_BOT_TOKEN'];
        const config = require('../src/config');
        expect(config.DISCORDJS_BOT_TOKEN).toBe('test-token');
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
        process.env.DISCORDJS_APCHANNEL_ID = 'ap-channel-id';
        const storage = require('../src/storage');
        storage.loadSettings.mockReturnValue({});
        storage.SENSITIVE_SETTINGS_KEYS = ['DISCORDJS_APCHANNEL_ID'];
        const config = require('../src/config');
        expect(config.DISCORDJS_APCHANNEL_ID).toBe('ap-channel-id');
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