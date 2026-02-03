const fs = require('fs-extra');
const { saveSettings, SENSITIVE_SETTINGS_KEYS } = require('../src/storage');

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
        };

        // Populate with all sensitive keys
        SENSITIVE_SETTINGS_KEYS.forEach(key => {
            sensitiveSettings[key] = `secret_${key}`;
        });

        await saveSettings(sensitiveSettings);

        const savedContent = fs.readJSONSync(SETTINGS_FILE);

        expect(savedContent).toHaveProperty('interval', 10);
        
        // Check that all sensitive keys are excluded
        SENSITIVE_SETTINGS_KEYS.forEach(key => {
            expect(savedContent).not.toHaveProperty(key);
        });
    });
});
