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
                DISCORDJS_TEXTCHANNEL_ID: '123',
                defaultChannelId: '123',
                other: 'value'
            };
            await storage.saveSettings(settings);

            const savedSettings = fs.outputJSON.mock.calls[0][1];
            expect(savedSettings.DISCORDJS_BOT_TOKEN).toBeUndefined();
            expect(savedSettings.DISCORDJS_TEXTCHANNEL_ID).toBeUndefined();
            expect(savedSettings.defaultChannelId).toBe('123');
            expect(savedSettings.interval).toBe(5);
            expect(savedSettings.other).toBe('value');
        });

        it('should preserve channelId in channels array', async () => {
            const settings = {
                channels: [
                    { name: 'QA', channelId: '123', enabled: true },
                    { name: 'Deals', channelId: '456', enabled: false }
                ]
            };
            await storage.saveSettings(settings);

            const savedSettings = fs.outputJSON.mock.calls[fs.outputJSON.mock.calls.length - 1][1];
            expect(savedSettings.channels[0].channelId).toBe('123');
            expect(savedSettings.channels[1].channelId).toBe('456');
            expect(savedSettings.channels[0].name).toBe('QA');
        });
    });

    describe('readEngagement', () => {
        it('should return parsed JSON when file exists', async () => {
            const mockData = { links: { abc: { url: 'https://ex.com' } } };
            fs.readJSON.mockResolvedValueOnce(mockData);

            const result = await storage.readEngagement('some/file.json');
            expect(result).toEqual(mockData);
        });

        it('should return empty object on ENOENT error', async () => {
            const enoentErr = new Error('File not found');
            enoentErr.code = 'ENOENT';
            fs.readJSON.mockRejectedValueOnce(enoentErr);

            const result = await storage.readEngagement('missing.json');
            expect(result).toEqual({});
        });

        it('should propagate other errors such as corrupt JSON or permission errors', async () => {
            const parseErr = new Error('Unexpected token');
            parseErr.code = 'EIO';
            fs.readJSON.mockRejectedValueOnce(parseErr);

            await expect(storage.readEngagement('corrupt.json')).rejects.toThrow('Unexpected token');
        });
    });

    describe('writeAtomic', () => {
        it('should write to a temporary file and move it atomically over target', async () => {
            fs.outputJSON.mockResolvedValueOnce();
            fs.rename.mockResolvedValueOnce();

            const testData = { links: {} };
            await storage.writeAtomic('config/deals.json', testData);

            expect(fs.outputJSON).toHaveBeenCalledWith(
                expect.stringMatching(/config\/deals\.json\.\d+\.\d+\.[a-f0-9]+\.tmp$/),
                testData,
                { spaces: 2 }
            );
            expect(fs.rename).toHaveBeenCalledWith(
                expect.stringMatching(/config\/deals\.json\.\d+\.\d+\.[a-f0-9]+\.tmp$/),
                'config/deals.json'
            );
        });

        it('should clean up temporary file and rethrow when writing or moving fails', async () => {
            const writeErr = new Error('Disk full');
            fs.outputJSON.mockRejectedValueOnce(writeErr);
            fs.remove.mockResolvedValueOnce();

            await expect(storage.writeAtomic('config/deals.json', {})).rejects.toThrow('Disk full');

            expect(fs.remove).toHaveBeenCalledWith(
                expect.stringMatching(/config\/deals\.json\.\d+\.\d+\.[a-f0-9]+\.tmp$/)
            );
        });
    });
});
