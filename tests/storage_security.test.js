const fs = require('fs-extra');
const { saveSettings, SENSITIVE_SETTINGS_KEYS } = require('../src/storage');

jest.mock('fs-extra');

describe('saveSettings', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

        // Check that fs.outputJSON was called
        expect(fs.outputJSON).toHaveBeenCalled();
        
        // Get the saved content from the first call's second argument
        const savedContent = fs.outputJSON.mock.calls[0][1];

        expect(savedContent).toHaveProperty('interval', 10);
        
        // Check that all sensitive keys are excluded
        SENSITIVE_SETTINGS_KEYS.forEach(key => {
            expect(savedContent).not.toHaveProperty(key);
        });
    });
});
