const fs = require('fs-extra');
const { saveSettings } = require('../src/storage');

const SETTINGS_FILE = './config/settings.json';

describe('saveSettings', () => {
    beforeAll(() => {
        // Ensure config dir exists
        fs.ensureDirSync('./config');
    });

    afterEach(() => {
        // Clean up
        if (fs.existsSync(SETTINGS_FILE)) {
            fs.unlinkSync(SETTINGS_FILE);
        }
    });

    it('should exclude sensitive environment variables from settings.json', async () => {
        const sensitiveSettings = {
            interval: 10,
            DISCORDJS_BOT_TOKEN: 'secret_token',
            DISCORDJS_TEXTCHANNEL_ID: '123',
            DISCORDJS_ADMINCHANNEL_ID: '456',
            DISCORDJS_ROLE_ID: '789',
            SINGLE_RUN: true,
            // New ones to exclude
            DISCORDJS_APCHANNEL_ID: 'abc'
        };

        await saveSettings(sensitiveSettings);

        const savedContent = fs.readJSONSync(SETTINGS_FILE);

        expect(savedContent).toHaveProperty('interval', 10);
        
        // Existing checks
        expect(savedContent).not.toHaveProperty('DISCORDJS_BOT_TOKEN');
        expect(savedContent).not.toHaveProperty('DISCORDJS_TEXTCHANNEL_ID');
        expect(savedContent).not.toHaveProperty('DISCORDJS_ADMINCHANNEL_ID');
        expect(savedContent).not.toHaveProperty('DISCORDJS_ROLE_ID');
        expect(savedContent).not.toHaveProperty('SINGLE_RUN');

        // New checks
        expect(savedContent).not.toHaveProperty('DISCORDJS_APCHANNEL_ID');
    });
});
