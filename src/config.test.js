jest.mock('./storage');

describe('config', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('should load environment variables', () => {
        process.env.DISCORDJS_BOT_TOKEN = 'test-token';
        const config = require('./config');
        expect(config.DISCORDJS_BOT_TOKEN).toBe('test-token');
    });

    it('should load settings from storage', () => {
        const storage = require('./storage');
        storage.loadSettings.mockReturnValue({ interval: 10 });
        const config = require('./config');
        expect(config.interval).toBe(10);
    });
});