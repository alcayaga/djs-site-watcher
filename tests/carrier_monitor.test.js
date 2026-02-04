const CarrierMonitor = require('../src/monitors/CarrierMonitor');
const Monitor = require('../src/Monitor');
const Discord = require('discord.js');
const got = require('got');
require('../src/storage'); // Only require, no assignment
const plist = require('plist');

// Mock external modules
jest.mock('plist');
jest.mock('discord.js');
jest.mock('got');
jest.mock('../src/storage');
jest.mock('../src/config', () => ({
    DISCORDJS_TEXTCHANNEL_ID: 'mockChannelId',
    interval: 5,
}));

describe('CarrierMonitor', () => {
    let client;
    let carrierMonitor;
    let monitorConfig;
    let mockChannelSend;
    let mockMessageEmbedInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup Discord mocks
        mockChannelSend = jest.fn();
        mockMessageEmbedInstance = {
            setTitle: jest.fn().mockReturnThis(),
            addFields: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
        };
        jest.spyOn(Discord, 'Client').mockImplementation(() => ({
            channels: {
                cache: {
                    get: jest.fn(() => ({ send: mockChannelSend })),
                },
            },
        }));
        jest.spyOn(Discord, 'EmbedBuilder').mockImplementation(() => mockMessageEmbedInstance);

        client = new Discord.Client();
        monitorConfig = { carriers: ['Verizon_US', 'ATT_US'], file: 'carrier.json' };
        carrierMonitor = new CarrierMonitor('Carrier', monitorConfig);
        carrierMonitor.client = client; // Manually set client for testing check method

        // Default got mock
        got.mockResolvedValue({ body: 'dummy plist content' });
    });

    // Test parse method
    describe('parse method', () => {
        it('should parse plist and extract carrier bundle info for configured carriers', () => {
            const mockPlistData = {
                MobileDeviceCarrierBundlesByProductVersion: {
                    'Verizon_US': {
                        '47.0': { BuildVersion: '47.0.1', BundleURL: 'http://verizon.com/47.0' },
                        '48.0': { BuildVersion: '48.0.0', BundleURL: 'http://verizon.com/48.0' },
                    },
                    'ATT_US': {
                        '46.0': { BuildVersion: '46.0.0', BundleURL: 'http://att.com/46.0' },
                    },
                    'TMobile_US': { // Not configured to monitor
                        '1.0': { BuildVersion: '1.0.0', BundleURL: 'http://tmobile.com/1.0' },
                    },
                },
            };
            plist.parse.mockReturnValueOnce(mockPlistData);

            const parsedData = carrierMonitor.parse('dummy plist content');
            expect(plist.parse).toHaveBeenCalledWith('dummy plist content');
            expect(parsedData).toEqual({
                'Verizon_US': { id: 'Verizon_US', version: '48.0', build: '48.0.0', url: 'http://verizon.com/48.0' },
                'ATT_US': { id: 'ATT_US', version: '46.0', build: '46.0.0', url: 'http://att.com/46.0' },
            });
        });

        it('should handle carriers not present in plist data', () => {
            const mockPlistData = {
                MobileDeviceCarrierBundlesByProductVersion: {
                    'ATT_US': {
                        '46.0': { BuildVersion: '46.0.0', BundleURL: 'http://att.com/46.0' },
                    },
                },
            };
            plist.parse.mockReturnValueOnce(mockPlistData);

            const parsedData = carrierMonitor.parse('dummy plist content');
            expect(parsedData).toEqual({
                'ATT_US': { id: 'ATT_US', version: '46.0', build: '46.0.0', url: 'http://att.com/46.0' },
            });
            // Verizon_US should be absent as it's not in mockPlistData
        });

        it('should return empty object if no carriers are configured', () => {
            carrierMonitor.config.carriers = [];
            const mockPlistData = { MobileDeviceCarrierBundlesByProductVersion: {} };
            plist.parse.mockReturnValueOnce(mockPlistData);
            
            const parsedData = carrierMonitor.parse('dummy plist content');
            expect(parsedData).toEqual({});
        });

        it('should return empty object if plist parsing fails or returns unexpected structure', () => {
            plist.parse.mockReturnValueOnce({}); // Empty or malformed plist
            
            const parsedData = carrierMonitor.parse('malformed plist');
            expect(parsedData).toEqual({});
        });
    });

    // Test compare method
    describe('compare method', () => {
        const oldState = {
            'Verizon_US': { id: 'Verizon_US', version: '47.0', build: '47.0.0', url: 'http://v.com/47' },
            'ATT_US': { id: 'ATT_US', version: '46.0', build: '46.0.0', url: 'http://a.com/46' },
        };

        beforeEach(() => {
            carrierMonitor.state = oldState;
        });

        it('should detect a completely new carrier', () => {
            const newData = {
                ...oldState,
                'TMobile_US': { id: 'TMobile_US', version: '1.0', build: '1.0.0', url: 'http://t.com/1' },
            };
            const changes = carrierMonitor.compare(newData);
            expect(changes.updated).toEqual([
                expect.objectContaining({ id: 'TMobile_US', version: '1.0', build: '1.0.0' }),
            ]);
        });

        it('should detect a new version for an existing carrier', () => {
            const newData = {
                ...oldState,
                'Verizon_US': { id: 'Verizon_US', version: '48.0', build: '47.0.0', url: 'http://v.com/48' },
            };
            const changes = carrierMonitor.compare(newData);
            expect(changes.updated).toEqual([
                expect.objectContaining({ id: 'Verizon_US', version: '48.0', build: '47.0.0' }),
            ]);
        });

        it('should detect a new build for an existing carrier', () => {
            const newData = {
                ...oldState,
                'Verizon_US': { id: 'Verizon_US', version: '47.0', build: '47.0.1', url: 'http://v.com/47' },
            };
            const changes = carrierMonitor.compare(newData);
            expect(changes.updated).toEqual([
                expect.objectContaining({ id: 'Verizon_US', version: '47.0', build: '47.0.1' }),
            ]);
        });

        it('should return null if no changes are detected', () => {
            const changes = carrierMonitor.compare(oldState);
            expect(changes).toBeNull();
        });

        it('should handle empty old state', () => {
            carrierMonitor.state = {};
            const newData = {
                'Verizon_US': { id: 'Verizon_US', version: '47.0', build: '47.0.0', url: 'http://v.com/47' },
            };
            const changes = carrierMonitor.compare(newData);
            expect(changes.updated).toEqual([
                expect.objectContaining({ id: 'Verizon_US', version: '47.0', build: '47.0.0' }),
            ]);
        });
    });

    // Test saveState method
    describe('saveState method', () => {
        it('should merge new state with existing state before calling super.saveState', async () => {
            carrierMonitor.state = { "Existing Carrier": { version: '1.0', build: '1.0.0' } };
            const newState = { "New Carrier": { version: '2.0', build: '2.0.0' } };
            const expectedMergedState = {
                "Existing Carrier": { version: '1.0', build: '1.0.0' },
                "New Carrier": { version: '2.0', build: '2.0.0' },
            };
            
            jest.spyOn(Monitor.prototype, 'saveState').mockResolvedValue();

            await carrierMonitor.saveState(newState);

            expect(Monitor.prototype.saveState).toHaveBeenCalledWith(expectedMergedState);
        });
    });

    // Test notify method
    describe('notify method', () => {
        beforeEach(() => {
            mockChannelSend.mockClear();
            Discord.Client.mock.results[0].value.channels.cache.get.mockClear();
            Discord.EmbedBuilder.mockClear();
            mockMessageEmbedInstance.setTitle.mockClear();
            mockMessageEmbedInstance.addFields.mockClear();
            mockMessageEmbedInstance.setColor.mockClear();
        });

        it('should send embeds for each updated carrier', () => {
            const changes = {
                updated: [
                    { id: 'Verizon_US', version: '48.0', build: '48.0.0', url: 'http://v.com/48', lastUpdated: 'now' },
                    { id: 'ATT_US', version: '47.0', build: '47.0.1', url: 'http://a.com/47', lastUpdated: 'soon' },
                ],
            };
            carrierMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannelSend).toHaveBeenCalledTimes(2); // One for each updated item

            // Check first embed
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('📲 ¡Nuevo Carrier Bundle para Verizon_US!');
            expect(mockMessageEmbedInstance.addFields).toHaveBeenCalledWith([
                { name: 'Versión', value: '48.0' },
                { name: 'Build', value: '48.0.0' },
                { name: 'URL', value: 'http://v.com/48' },
                { name: 'Actualizado', value: '`now`' }
            ]);
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith(0x00FF00);
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const changes = { updated: [{ id: 'Verizon_US', version: '48.0', build: '48.0.0', url: 'http://v.com/48', lastUpdated: 'now' }] };

            carrierMonitor.notify(changes);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for Carrier.'));
            expect(mockChannelSend).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });
});
