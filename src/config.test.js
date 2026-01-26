jest.mock('./storage');

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
        const config = require('./config');
        expect(config.DISCORDJS_BOT_TOKEN).toBe('test-token');
    });

    /**
     * Test case for loading settings from storage.
     */
    it('should load settings from storage', () => {
        const storage = require('./storage');
        storage.loadSettings.mockReturnValue({ interval: 10 });
        const config = require('./config');
        expect(config.interval).toBe(10);
    });
});