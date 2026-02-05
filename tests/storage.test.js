const storage = require('../src/storage');
const fs = require('fs-extra');

jest.mock('fs-extra');

describe('storage', () => {
    describe('loadSites', () => {
        it('should return the array if the file contains an array', () => {
            const mockSites = [{ id: 'site1' }];
            fs.readJSONSync.mockReturnValue(mockSites);

            const result = storage.loadSites();
            expect(result).toEqual(mockSites);
        });

        it('should return the sites property if the file contains an object with sites array', () => {
            const mockSites = [{ id: 'site1' }];
            const mockFileContent = { sites: mockSites };
            fs.readJSONSync.mockReturnValue(mockFileContent);

            const result = storage.loadSites();
            expect(result).toEqual(mockSites);
        });

        it('should return empty array if file content is empty/invalid', () => {
             fs.readJSONSync.mockReturnValue({});
             const result = storage.loadSites();
             expect(result).toEqual([]);
        });
        
        it('should return empty array if readJSONSync throws', () => {
            fs.readJSONSync.mockImplementation(() => { throw new Error('File not found'); });
            const result = storage.loadSites();
            expect(result).toEqual([]);
        });
    });

    describe('saveSettings', () => {
        it('should scrub sensitive top-level keys', async () => {
            const settings = {
                interval: 5,
                DISCORDJS_BOT_TOKEN: 'secret-token',
                other: 'value'
            };
            await storage.saveSettings(settings);

            const savedSettings = fs.outputJSON.mock.calls[0][1];
            expect(savedSettings.DISCORDJS_BOT_TOKEN).toBeUndefined();
            expect(savedSettings.interval).toBe(5);
            expect(savedSettings.other).toBe('value');
        });

        it('should scrub channelId from channels array', async () => {
            const settings = {
                channels: [
                    { name: 'QA', channelId: '123', enabled: true },
                    { name: 'Deals', channelId: '456', enabled: false }
                ]
            };
            await storage.saveSettings(settings);

            const savedSettings = fs.outputJSON.mock.calls[fs.outputJSON.mock.calls.length - 1][1];
            expect(savedSettings.channels[0].channelId).toBeUndefined();
            expect(savedSettings.channels[1].channelId).toBeUndefined();
            expect(savedSettings.channels[0].name).toBe('QA');
        });
    });
});
