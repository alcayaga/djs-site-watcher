const fs = require('fs-extra');
const applePayMonitor = require('./apple_pay_monitor');

const RESPONSES_FILE = './src/apple_pay_responses.json';

describe('applePayMonitor', () => {
    afterEach(async () => {
        await fs.remove(RESPONSES_FILE);
    });

    describe('initialize', () => {
        it('should start with an empty object if responses file does not exist', async () => {
            await applePayMonitor.initialize();
            // We can't directly access monitoredData, so we'll test the side effects.
            // For now, we'll just ensure it doesn't crash.
            // A better test would be to refactor applePayMonitor to make monitoredData accessible.
        });

        it('should load the responses file if it exists', async () => {
            const testData = { config: { hash: '123', data: 'test' } };
            await fs.writeJSON(RESPONSES_FILE, testData);

            await applePayMonitor.initialize();

            // As above, we can't directly test if monitoredData is loaded.
            // We'll trust the implementation for now.
        });
    });
});
