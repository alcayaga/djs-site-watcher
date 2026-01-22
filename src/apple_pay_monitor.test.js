const fs = require('fs-extra');
const got = require('got');
const Discord = require('discord.js');
const crypto = require('crypto');

jest.mock('fs-extra');
jest.mock('got');
jest.mock('discord.js');
jest.mock('crypto');

const RESPONSES_FILE = './src/apple_pay_responses.json';

describe('Apple Pay Monitor', () => {
    let mockClient;
    let mockChannel;
    let applePayMonitor;
    let fs;
    let got;
    let Discord;
    let crypto;

    beforeEach(() => {
        jest.resetModules(); // This is key to resetting state between tests

        // Re-require modules to get fresh mocks
        fs = require('fs-extra');
        got = require('got');
        Discord = require('discord.js');
        crypto = require('crypto');
        applePayMonitor = require('./apple_pay_monitor');

        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get();

        // Setup default mock implementations
        fs.readJSON.mockResolvedValue({});
        fs.outputJSON.mockResolvedValue();
        got.mockResolvedValue({ body: {} });
        crypto.createHash.mockReturnValue({
            update: jest.fn().mockReturnThis(),
            digest: jest.fn().mockReturnValue('mock-hash'),
        });
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mock-channel-id';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initialize', () => {
        it('should load existing data from file', async () => {
            const mockData = { config: { hash: '123', data: 'test' } };
            fs.readJSON.mockResolvedValue(mockData);
            await applePayMonitor.initialize();
            expect(fs.readJSON).toHaveBeenCalledWith(RESPONSES_FILE);
        });

        it('should handle error when reading file', async () => {
            fs.readJSON.mockRejectedValue(new Error('File not found'));
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            await applePayMonitor.initialize();
            expect(consoleLogSpy).toHaveBeenCalledWith(`Cannot read ${RESPONSES_FILE}, starting fresh.`);
            consoleLogSpy.mockRestore();
        });
    });

    describe('check', () => {
        const mockConfigData = {
            SupportedRegions: {
                CL: {
                    someKey: 'someValue',
                    anotherKey: 'anotherValue',
                },
            },
            MarketGeosURL: 'https://example.com/marketgeos.json',
        };

        const mockMarketGeosData = {
            MarketGeos: [
                { Region: 'CL', identifier: 'geo1' },
                { Region: 'US', identifier: 'geo2' },
            ],
        };

        const generateHash = (data) => {
            return crypto.createHash('md5').update(JSON.stringify(data, null, 2)).digest('hex');
        };

        it('should not detect changes or send notifications if data is unchanged', async () => {
            // Mock initial state from file system
            const initialMonitoredData = {
                config: {
                    hash: generateHash(mockConfigData.SupportedRegions.CL),
                    data: JSON.stringify(mockConfigData.SupportedRegions.CL),
                    marketgeos: {
                        url: mockConfigData.MarketGeosURL,
                        identifiers: mockMarketGeosData.MarketGeos.filter(geo => geo.Region === 'CL').map(geo => geo.identifier),
                    },
                },
                'config-alt': {
                    hash: generateHash(mockConfigData.SupportedRegions.CL),
                    data: JSON.stringify(mockConfigData.SupportedRegions.CL),
                    marketgeos: {
                        url: mockConfigData.MarketGeosURL,
                        identifiers: mockMarketGeosData.MarketGeos.filter(geo => geo.Region === 'CL').map(geo => geo.identifier),
                    },
                },
            };
            fs.readJSON.mockResolvedValueOnce(initialMonitoredData);
            await applePayMonitor.initialize();

            // Mock got responses to return the same data
            got.mockImplementation((url) => {
                if (url === 'https://smp-device-content.apple.com/static/region/v2/config.json' || url === 'https://smp-device-content.apple.com/static/region/v2/config-alt.json') {
                    return { body: mockConfigData };
                }
                if (url === 'https://example.com/marketgeos.json') {
                    return { body: mockMarketGeosData };
                }
                throw new Error(`Unexpected URL for got.get: ${url}`);
            });

            await applePayMonitor.check(mockClient);

            expect(got).toHaveBeenCalledTimes(4); // 2 config URLs + 2 marketGeos URLs
            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(fs.outputJSON).not.toHaveBeenCalled();
        });
    });
});