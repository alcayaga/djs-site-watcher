// Mock external modules at the top-level
jest.doMock('../src/storage', () => ({
    read: jest.fn(),
    write: jest.fn(),
    loadSettings: jest.fn().mockReturnValue({
        interval: 5,
        debug: false,
    }),
}));

const ApplePayMonitor = require('../src/monitors/ApplePayMonitor');
// const { JSDOM } = require('jsdom'); // Not used directly, but mocked globally
const Discord = require('discord.js');
const got = require('got');
require('../src/storage'); // Only require, no assignment
const diff = require('diff');
// const crypto = require('crypto'); // Not used directly, but mocked globally

// Define mockChannel here as it's used in the Discord mock
let mockChannel = {};

// Mock specific external dependencies
jest.mock('jsdom'); // Still mock, even if not used, for consistency
jest.mock('discord.js');
jest.mock('got');
jest.mock('../src/storage');
jest.mock('../src/config', () => ({
    DISCORDJS_TEXTCHANNEL_ID: 'mockChannelId',
    interval: 5,
}));
jest.mock('diff', () => ({
    diffLines: jest.fn(),
}));

describe('ApplePayMonitor', () => {
    let client;
    let applePayMonitor;
    let monitorConfig;
    let mockChannelSend;
    let mockMessageEmbedInstance;

    beforeEach(() => {
        jest.clearAllMocks(); // Clear all mocks before each test

        // --- Mock Discord.js components directly in beforeEach ---
        mockChannelSend = jest.fn();
        mockChannel = { send: mockChannelSend };
        mockMessageEmbedInstance = {
            setTitle: jest.fn().mockReturnThis(),
            addField: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
        };

        // Fix 2: Set process.env.DISCORDJS_TEXTCHANNEL_ID before Discord.Client is mocked
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mockChannelId';

        jest.spyOn(Discord, 'Client').mockImplementation(() => ({
            channels: {
                cache: {
                    get: jest.fn((channelId) => { // Capture channelId here
                        if (channelId === process.env.DISCORDJS_TEXTCHANNEL_ID) {
                            return { send: mockChannelSend };
                        }
                        return undefined;
                    }),
                },
            },
        }));
        jest.spyOn(Discord, 'MessageEmbed').mockImplementation(() => mockMessageEmbedInstance);
        // --- End Mock Discord.js components ---

        jest.requireMock('jsdom').JSDOM.mockClear();

        client = new Discord.Client(); // Instantiate mocked client
        monitorConfig = { file: 'applepay.json', region: 'CL' };
        applePayMonitor = new ApplePayMonitor('ApplePay', monitorConfig);
        applePayMonitor.client = client; // Manually set client for testing check method

        // Default got mock
        got.mockResolvedValue({ body: {} }); // Default to empty object response
    });

    // Test Constructor
    describe('Constructor', () => {
        it('should set default config URLs and region if not provided', () => {
            const defaultMonitor = new ApplePayMonitor('DefaultApplePay', { file: 'default.json' });
            expect(defaultMonitor.CONFIG_URL).toBe('https://smp-device-content.apple.com/static/region/v2/config.json');
            expect(defaultMonitor.CONFIG_ALT_URL).toBe('https://smp-device-content.apple.com/static/region/v2/config-alt.json');
            expect(defaultMonitor.REGION_TO_MONITOR).toBe('CL');
        });

        it('should use provided config URLs and region', () => {
            const customMonitor = new ApplePayMonitor('CustomApplePay', {
                file: 'custom.json',
                configUrl: 'http://custom.com/config.json',
                configAltUrl: 'http://custom.com/config-alt.json',
                region: 'US',
            });
            expect(customMonitor.CONFIG_URL).toBe('http://custom.com/config.json');
            expect(customMonitor.CONFIG_ALT_URL).toBe('http://custom.com/config-alt.json');
            expect(customMonitor.REGION_TO_MONITOR).toBe('US');
        });
    });

    // Test fetch method
    describe('fetch method', () => {
        it('should fetch data from main config URL and market geos URL', async () => {
            got.mockImplementation((url) => {
                if (url === applePayMonitor.CONFIG_URL) {
                    return Promise.resolve({ body: { SupportedRegions: {}, MarketGeosURL: 'http://marketgeos.com' } });
                }
                if (url === 'http://marketgeos.com') {
                    return Promise.resolve({ body: { MarketGeos: [] } });
                }
                return Promise.resolve({ body: {} });
            });

            const fetchedData = await applePayMonitor.fetch();
            expect(got).toHaveBeenCalledWith(applePayMonitor.CONFIG_URL, { responseType: 'json' });
            expect(got).toHaveBeenCalledWith('http://marketgeos.com', { responseType: 'json' });
            expect(fetchedData.config).toBeDefined();
            expect(fetchedData.configMarketGeos).toBeDefined();
        });

        it('should fetch data from alt config URL and market geos alt URL', async () => {
            got.mockImplementation((url) => {
                if (url === applePayMonitor.CONFIG_ALT_URL) {
                    return Promise.resolve({ body: { SupportedRegions: {}, MarketGeosURL: 'http://marketgeos-alt.com' } });
                }
                if (url === 'http://marketgeos-alt.com') {
                    return Promise.resolve({ body: { MarketGeos: [] } });
                }
                return Promise.resolve({ body: {} });
            });

            const fetchedData = await applePayMonitor.fetch();
            expect(got).toHaveBeenCalledWith(applePayMonitor.CONFIG_ALT_URL, { responseType: 'json' });
            expect(got).toHaveBeenCalledWith('http://marketgeos-alt.com', { responseType: 'json' });
            expect(fetchedData.configAlt).toBeDefined();
            expect(fetchedData.configAltMarketGeos).toBeDefined();
        });

        it('should handle errors when fetching main config', async () => {
            got.mockImplementation((url) => {
                if (url === applePayMonitor.CONFIG_URL) {
                    return Promise.reject(new Error('Main config error'));
                }
                return Promise.resolve({ body: {} });
            });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const fetchedData = await applePayMonitor.fetch();
            expect(fetchedData.config).toBeNull();
            // Fix 1: Include expect.any(Error)
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching Apple Pay main config'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should handle errors when fetching alt config', async () => {
            got.mockImplementation((url) => {
                if (url === applePayMonitor.CONFIG_ALT_URL) {
                    return Promise.reject(new Error('Alt config error'));
                }
                return Promise.resolve({ body: {} });
            });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const fetchedData = await applePayMonitor.fetch();
            expect(fetchedData.configAlt).toBeNull();
            // Fix 1: Include expect.any(Error)
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching Apple Pay alt config'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });
    });

    // Test parse method
    describe('parse method', () => {
        const rawConfig = {
            SupportedRegions: {
                CL: { Banks: [{ Name: 'Bank 1' }] },
                US: { Banks: [{ Name: 'Bank A' }] },
            },
            MarketGeosURL: 'http://marketgeos.com',
        };
        const rawMarketGeos = {
            MarketGeos: [
                { Region: 'CL', Identifier: 'CL_Geo1', LocalizedName: { en: 'Chile Geo 1' } },
                { Region: 'US', Identifier: 'US_Geo1', LocalizedName: { en: 'USA Geo 1' } },
            ],
        };

        it('should parse main config region and market geos', () => {
            const rawData = { config: rawConfig, configMarketGeos: rawMarketGeos };
            const parsed = applePayMonitor.parse(rawData);
            expect(parsed.configRegion).toBe(JSON.stringify(rawConfig.SupportedRegions.CL, null, 2));
            expect(parsed.configMarketGeoIdentifiers).toEqual([
                { id: 'CL_Geo1', name: 'Chile Geo 1' },
            ]);
        });

        it('should parse alt config region and market geos', () => {
            const rawData = { configAlt: rawConfig, configAltMarketGeos: rawMarketGeos };
            const parsed = applePayMonitor.parse(rawData);
            expect(parsed.configAltRegion).toBe(JSON.stringify(rawConfig.SupportedRegions.CL, null, 2));
            expect(parsed.configAltMarketGeoIdentifiers).toEqual([
                { id: 'CL_Geo1', name: 'Chile Geo 1' },
            ]);
        });

        it('should handle missing SupportedRegions in config', () => {
            const rawData = { config: { MarketGeosURL: 'http://marketgeos.com' } };
            const parsed = applePayMonitor.parse(rawData);
            expect(parsed.configRegion).toBeUndefined();
        });

        it('should handle missing MarketGeos in configMarketGeos', () => {
            const rawData = { config: rawConfig, configMarketGeos: { } };
            const parsed = applePayMonitor.parse(rawData);
            expect(parsed.configMarketGeoIdentifiers).toBeUndefined();
        });

        it('should handle missing LocalizedName.en', () => {
            const rawMarketGeosNoEn = {
                MarketGeos: [
                    { Region: 'CL', Identifier: 'CL_Geo1', LocalizedName: { es: 'Chile Geo 1' } },
                ],
            };
            const rawData = { config: rawConfig, configMarketGeos: rawMarketGeosNoEn };
            const parsed = applePayMonitor.parse(rawData);
            expect(parsed.configMarketGeoIdentifiers).toEqual([
                { id: 'CL_Geo1', name: undefined }, // LocalizedName.en is undefined
            ]);
        });
    });

    // Test compare method
    describe('compare method', () => {
        const oldState = {
            configRegion: '{"Banks":[{"Name":"Bank 1"}]}',
            configMarketGeoIdentifiers: [{ id: 'CL_Geo1', name: 'Chile Geo 1' }],
            configAltRegion: '{"Banks":[{"Name":"Bank A"}]}',
            configAltMarketGeoIdentifiers: [{ id: 'CL_AltGeo1', name: 'Chile Alt Geo 1' }],
        };

        beforeEach(() => {
            applePayMonitor.state = oldState;
            diff.diffLines.mockImplementation((oldStr, newStr) => {
                if (oldStr !== newStr) {
                    return [{ value: 'diff line', added: true }];
                }
                return [];
            });
        });

        it('should detect regionDiff in main config', () => {
            const newState = { ...oldState, configRegion: '{"Banks":[{"Name":"Bank 2"}]}' };
            const changes = applePayMonitor.compare(newState);
            expect(changes.changes).toHaveLength(1);
            expect(changes.changes[0].type).toBe('regionDiff');
            expect(changes.changes[0].configName).toBe('main config');
            expect(changes.changes[0].diff).toBe('🟢 diff line\n');
        });

        it('should detect newMarketGeo in main config', () => {
            const newState = {
                ...oldState,
                configMarketGeoIdentifiers: [{ id: 'CL_Geo1', name: 'Chile Geo 1' }, { id: 'CL_Geo2', name: 'Chile Geo 2' }],
            };
            const changes = applePayMonitor.compare(newState);
            expect(changes.changes).toHaveLength(1);
            expect(changes.changes[0].type).toBe('newMarketGeo');
            expect(changes.changes[0].geo).toEqual({ id: 'CL_Geo2', name: 'Chile Geo 2' });
        });

        it('should detect regionDiff in alt config', () => {
            const newState = { ...oldState, configAltRegion: '{"Banks":[{"Name":"Bank B"}]}' };
            const changes = applePayMonitor.compare(newState);
            expect(changes.changes).toHaveLength(1);
            expect(changes.changes[0].type).toBe('regionDiff');
            expect(changes.changes[0].configName).toBe('alt config');
        });

        it('should detect newMarketGeo in alt config', () => {
            const newState = {
                ...oldState,
                configAltMarketGeoIdentifiers: [{ id: 'CL_AltGeo1', name: 'Chile Alt Geo 1' }, { id: 'CL_AltGeo2', name: 'Chile Alt Geo 2' }],
            };
            const changes = applePayMonitor.compare(newState);
            expect(changes.changes).toHaveLength(1);
            expect(changes.changes[0].type).toBe('newMarketGeo');
            expect(changes.changes[0].geo).toEqual({ id: 'CL_AltGeo2', name: 'Chile Alt Geo 2' });
        });

        it('should return null if no changes are detected', () => {
            const changes = applePayMonitor.compare(oldState);
            expect(changes).toBeNull();
        });

        it('should handle diff truncation', () => {
            const longDiffString = 'a'.repeat(2000);
            diff.diffLines.mockReturnValueOnce([{ value: longDiffString, added: true }]);
            const newState = { ...oldState, configRegion: '{"Banks":[{"Name":"Bank 2"}]}' };
            const changes = applePayMonitor.compare(newState);
            expect(changes.changes[0].diff).toContain('... (truncated)');
        });
    });

    // Test notify method
    describe('notify method', () => {
        beforeEach(() => {
            mockChannelSend.mockClear();
            // Clear the mock for client.channels.cache.get specifically for these tests.
            // Since it's a spyOn on an instance property, it needs to be cleared on the instance.
            if (client && client.channels && client.channels.cache && client.channels.cache.get) {
                client.channels.cache.get.mockClear();
            }
            Discord.MessageEmbed.mockClear();
            mockMessageEmbedInstance.setTitle.mockClear();
            mockMessageEmbedInstance.addField.mockClear();
            mockMessageEmbedInstance.setColor.mockClear();
        });

        it('should send embed for regionDiff change', () => {
            const changes = { changes: [{ type: 'regionDiff', configName: 'main config', diff: 'diff content', url: 'http://config.com' }] };
            applePayMonitor.notify(changes);

            // Fix 2: Assert against the mocked client.channels.cache.get directly
            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(2); // Embed + diff
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith(expect.stringContaining('¡Cambio en la configuración de Apple Pay para CL en main config!'));
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('URL', 'http://config.com');
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('#0071E3');
            expect(mockChannel.send).toHaveBeenCalledWith('```diff\ndiff content```');
        });

        it('should send embed for newMarketGeo change', () => {
            const changes = { changes: [{ type: 'newMarketGeo', configName: 'alt config', geo: { name: 'New Geo', id: 'new-geo-id' }, url: 'http://alt-config.com' }] };
            applePayMonitor.notify(changes);

            // Fix 2: Assert against the mocked client.channels.cache.get directly
            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith(expect.stringContaining('¡Nueva región en Transit para Apple Pay en alt config!'));
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Región', 'CL', true);
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Nombre', 'New Geo', true);
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('URL', 'http://alt-config.com');
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('#0071E3');
        });

        it('should log an error if notification channel not found', () => {
            // Fix 2: Mock client.channels.cache.get on the instance directly
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const changes = { changes: [{ type: 'regionDiff', configName: 'main config', diff: 'diff content', url: 'http://config.com' }] };

            applePayMonitor.notify(changes);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for ApplePay.'));
            expect(mockChannel.send).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    // Partial Failure Handling Tests
    describe('Partial Failure Handling', () => {
        beforeEach(() => {
            applePayMonitor.state = {
                configRegion: '{"main":"old"}',
                configAltRegion: '{"alt":"old"}',
                configMarketGeoIdentifiers: [],
                configAltMarketGeoIdentifiers: []
            };
        });

        it('should not report changes when fetch fails completely (missing keys in parsed data)', async () => {
            // Simulate Fetch Error (Network Timeout) -> fetch returns { config: null, configAlt: null }
            const fetchError = new Error('ETIMEDOUT');
            got.mockImplementation(() => Promise.reject(fetchError));

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            // Execute fetch
            const fetchedData = await applePayMonitor.fetch();
            
            // Execute parse (produces empty/undefined fields)
            const parsedData = applePayMonitor.parse(fetchedData);

            // Execute compare
            const changes = applePayMonitor.compare(parsedData);

            // Expect NO changes (null) because missing keys are patched with old state
            expect(changes).toBeNull();
            
            consoleErrorSpy.mockRestore();
        });

        it('should preserve old state for failed source when other source changes', async () => {
            // Mock Fetch: Main fails, Alt succeeds and changes
            const fetchError = new Error('ETIMEDOUT');
            got.mockImplementation((url) => {
                if (url === applePayMonitor.CONFIG_URL) {
                    return Promise.reject(fetchError);
                }
                if (url === applePayMonitor.CONFIG_ALT_URL) {
                    return Promise.resolve({ body: { SupportedRegions: { CL: { alt: "new" } } } });
                }
                return Promise.resolve({ body: {} });
            });

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            // Execute fetch & parse
            const fetchedData = await applePayMonitor.fetch();
            const parsedData = applePayMonitor.parse(fetchedData);

            // Mock diffLines for the ALT change
            diff.diffLines.mockImplementation((oldStr, newStr) => {
                if (oldStr === '{"alt":"old"}' && newStr.includes('"alt": "new"')) {
                    return [{ value: 'change', added: true }];
                }
                return [];
            });

            const changes = applePayMonitor.compare(parsedData);

            // Expect changes for Alt
            expect(changes).not.toBeNull();
            expect(changes.changes.some(c => c.configName === 'alt config')).toBe(true);

            // Expect NO changes for Main
            const mainChanges = changes.changes.filter(c => c.configName === 'main config');
            expect(mainChanges.length).toBe(0);

            // Expect parsedData (new state) to have preserved OLD main config
            expect(parsedData.configRegion).toBe('{"main":"old"}');

            consoleErrorSpy.mockRestore();
        });
    });
});
