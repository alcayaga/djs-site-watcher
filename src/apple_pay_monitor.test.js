const { ApplePayMonitor } = require('./apple_pay_monitor');
const fs = require('fs-extra');
const got = require('got');
const Discord = require('discord.js');
const crypto = require('crypto');

jest.mock('fs-extra');
jest.mock('got');
jest.mock('discord.js');
jest.mock('crypto');

describe('ApplePayMonitor', () => {
    let monitor;
    let mockClient;
    let mockChannel;

    beforeEach(() => {
        // Reset mocks before each test
        fs.readJSON.mockReset();
        fs.outputJSON.mockReset();
        got.mockReset();
        crypto.createHash.mockClear();

        // Setup mock for crypto
        crypto.createHash.mockReturnValue({
            update: jest.fn().mockReturnThis(),
            digest: jest.fn().mockReturnValue('mock-hash'),
        });

        // Setup mock for Discord
        mockChannel = { send: jest.fn() };
        mockClient = {
            channels: {
                cache: {
                    get: jest.fn().mockReturnValue(mockChannel),
                },
            },
        };
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mock-channel-id';

        // Create a new instance of the monitor for each test
        monitor = new ApplePayMonitor();
    });

    describe('initialize', () => {
        it('should load data from file if it exists', async () => {
            const testData = { config: { hash: 'old-hash' } };
            fs.readJSON.mockResolvedValue(testData);

            await monitor.initialize();

            expect(fs.readJSON).toHaveBeenCalledWith('./src/apple_pay_responses.json');
            expect(monitor.monitoredData).toEqual(testData);
        });

        it('should start with empty data if file does not exist', async () => {
            fs.readJSON.mockRejectedValue(new Error('File not found'));
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            await monitor.initialize();

            expect(monitor.monitoredData).toEqual({});
            expect(consoleLogSpy).toHaveBeenCalledWith('Cannot read ./src/apple_pay_responses.json, starting fresh.');
            consoleLogSpy.mockRestore();
        });
    });

    describe('check', () => {
        const mockConfigData = {
            SupportedRegions: { CL: { someKey: 'someValue' } },
            MarketGeosURL: 'https://example.com/marketgeos.json',
        };
        const mockMarketGeosData = { 
            MarketGeos: [{ Region: 'CL', Identifier: 'geo1', LocalizedName: { en: 'Geo 1' } }] 
        };

        beforeEach(() => {
            // Setup default 'got' mock for check tests
            got.mockImplementation((url) => {
                if (url.includes('marketgeos')) {
                    return Promise.resolve({ body: mockMarketGeosData });
                }
                return Promise.resolve({ body: mockConfigData });
            });
        });

        it('should detect and notify on SupportedRegions change', async () => {
            // 1. Setup initial state with old data
            const oldCLRegionData = { someKey: 'oldValue' };
            const oldHash = crypto.createHash('md5').update(JSON.stringify(oldCLRegionData, null, 2)).digest('hex');
            monitor.monitoredData = {
                config: { hash: 'old-hash-to-be-changed', data: JSON.stringify(oldCLRegionData) },
                'config-alt': { hash: oldHash, data: JSON.stringify(oldCLRegionData) },
            };

            // 2. Define new data for one of the configs
            const newCLRegionData = { someKey: 'newValue', newKey: 'a new key' };
            const newMockConfigData = {
                SupportedRegions: { CL: newCLRegionData },
                MarketGeosURL: 'https://example.com/marketgeos.json',
            };
            const oldMockConfigData = {
                SupportedRegions: { CL: oldCLRegionData },
                MarketGeosURL: 'https://example.com/marketgeos.json',
            };
            
            // 3. Mock 'got' to return a change for the main URL but not the alt URL
            got.mockImplementation((url) => {
                if (url === monitor.CONFIG_URL) {
                    return Promise.resolve({ body: newMockConfigData });
                }
                if (url === monitor.CONFIG_ALT_URL) {
                    return Promise.resolve({ body: oldMockConfigData });
                }
                if (url.includes('marketgeos')) {
                    // Return empty market geos for this test to keep it focused
                    return Promise.resolve({ body: { MarketGeos: [] } });
                }
                return Promise.reject(new Error(`Unexpected URL in got mock: ${url}`));
            });
            
            // 4. Spy on notifyDiff to ensure it's called
            const notifySpy = jest.spyOn(monitor, 'notifyDiff');

            // 5. Run check
            await monitor.check(mockClient);

            // 6. Assert
            // Only the main 'config' should have changed and triggered a notification
            expect(notifySpy).toHaveBeenCalledTimes(1); 
            expect(notifySpy).toHaveBeenCalledWith('config', expect.any(String), mockClient, monitor.CONFIG_URL);
            expect(mockChannel.send).toHaveBeenCalledTimes(2);

            // Check that the diff string is correct
            const diffString = mockChannel.send.mock.calls[1][0];
            expect(diffString).toMatch(/```diff\n/);
            expect(diffString).toContain('🔴   "someKey": "oldValue"');
            expect(diffString).toContain('🟢   "someKey": "newValue"');
            
            expect(fs.outputJSON).toHaveBeenCalledTimes(1);
        });

        it('should detect and notify on new MarketGeo', async () => {
            // 1. Setup initial state
            monitor.monitoredData = {
                config: { hash: 'mock-hash', marketgeos: { identifiers: ['old-geo'] } },
                'config-alt': { hash: 'mock-hash', marketgeos: { identifiers: ['old-geo'] } },
            };

            // 2. Mock 'got' to return new market geo data
            const newMarketGeosData = {
                MarketGeos: [
                    { Region: 'CL', Identifier: 'old-geo' },
                    { Region: 'CL', Identifier: 'new-geo', LocalizedName: { en: 'New Geo' } }
                ],
            };
            got.mockImplementation((url) => {
                if (url.includes('marketgeos')) {
                    return Promise.resolve({ body: newMarketGeosData });
                }
                return Promise.resolve({ body: mockConfigData });
            });
            
            // 3. Spy on notifyNewMarketGeo 
            const notifySpy = jest.spyOn(monitor, 'notifyNewMarketGeo');

            // 4. Run check
            await monitor.check(mockClient);

            // 5. Assert
            expect(notifySpy).toHaveBeenCalledTimes(2);
            expect(notifySpy).toHaveBeenCalledWith('config', expect.objectContaining({ Identifier: 'new-geo' }), mockClient, mockConfigData.MarketGeosURL);
            expect(fs.outputJSON).toHaveBeenCalledTimes(1);
            expect(monitor.monitoredData.config.marketgeos.identifiers).toEqual(['old-geo', 'new-geo']);
        });

        it('should not notify if there are no changes', async () => {
            // 1. Setup initial state to match the mock response
            monitor.monitoredData = {
                config: { hash: 'mock-hash', marketgeos: { identifiers: ['geo1'] } },
                'config-alt': { hash: 'mock-hash', marketgeos: { identifiers: ['geo1'] } },
            };

            // 2. Spy on notification methods
            const notifyDiffSpy = jest.spyOn(monitor, 'notifyDiff');
            const notifyNewMarketGeoSpy = jest.spyOn(monitor, 'notifyNewMarketGeo');

            // 3. Run check
            await monitor.check(mockClient);

            // 4. Assert
            expect(notifyDiffSpy).not.toHaveBeenCalled();
            expect(notifyNewMarketGeoSpy).not.toHaveBeenCalled();
            expect(fs.outputJSON).not.toHaveBeenCalled();
        });
    });
});
