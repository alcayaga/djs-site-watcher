const AppleEsimMonitor = require('./monitors/AppleEsimMonitor');
require('./Monitor'); // Only require, no assignment
// const { JSDOM } = require('jsdom'); // Not used directly, but mocked globally
const Discord = require('discord.js');
const got = require('got');
require('./storage'); // Only require, no assignment

// Mock external modules
jest.mock('jsdom', () => {
    // Return a class that, when instantiated, mimics JSDOM.
    return {
        JSDOM: jest.fn((html) => {
            // Create a real JSDOM instance once here using jest.requireActual
            const actualDom = new (jest.requireActual('jsdom').JSDOM)(html); 
            return {
                window: {
                    document: {
                        querySelectorAll: jest.fn((selector) => actualDom.window.document.querySelectorAll(selector)),
                        querySelector: jest.fn((selector) => actualDom.window.document.querySelector(selector)),
                        title: actualDom.window.document.title,
                    },
                },
            };
        }),
    };
});
jest.mock('discord.js');
jest.mock('got');
jest.mock('./storage');
jest.mock('./config', () => ({
    DISCORDJS_TEXTCHANNEL_ID: 'mockChannelId',
    interval: 5,
}));

describe('AppleEsimMonitor', () => {
    let client;
    let appleEsimMonitor;
    let monitorConfig;
    let mockChannelSend;
    let mockMessageEmbedInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup Discord mocks
        mockChannelSend = jest.fn();
        mockMessageEmbedInstance = {
            setTitle: jest.fn().mockReturnThis(),
            addField: jest.fn().mockReturnThis(),
            setColor: jest.fn().mockReturnThis(),
        };
        jest.spyOn(Discord, 'Client').mockImplementation(() => ({
            channels: {
                cache: {
                    get: jest.fn(() => ({ send: mockChannelSend })),
                },
            },
        }));
        jest.spyOn(Discord, 'MessageEmbed').mockImplementation(() => mockMessageEmbedInstance);

        // JSDOM mock implementation is handled by the jest.mock('jsdom') block.
        // We just need to clear its calls.
        jest.requireMock('jsdom').JSDOM.mockClear();

        client = new Discord.Client();
        monitorConfig = { country: 'Chile', file: 'apple_esim.json' };
        appleEsimMonitor = new AppleEsimMonitor('AppleEsim', monitorConfig);
        appleEsimMonitor.client = client; // Manually set client for testing check method

        // Default got mock
        got.mockResolvedValue({ body: '<html></html>' });
    });

    // Test parse method
    describe('parse method', () => {
        it('should parse HTML and extract eSIM carriers for the specified country', () => {
            const html = `
                <html>
                <body>
                    <h2>Chile</h2>
                    <h3>General</h3>
                    <ul>
                        <li><a href="http://carrier1.com">Carrier 1</a></li>
                        <li><a href="http://carrier2.com">Carrier 2</a></li>
                    </ul>
                    <h3>Specific Capability</h3>
                    <ul>
                        <li><a href="http://carrier3.com">Carrier 3</a></li>
                    </ul>
                    <h2>Another Country</h2>
                    <ul>
                        <li><a href="http://carrierX.com">Carrier X</a></li>
                    </ul>
                </body>
                </html>
            `;
            const parsedData = appleEsimMonitor.parse(html);
            expect(parsedData).toEqual({
                Chile: [
                    { name: 'Carrier 1', link: 'http://carrier1.com/', capability: 'General' },
                    { name: 'Carrier 2', link: 'http://carrier2.com/', capability: 'General' },
                    { name: 'Carrier 3', link: 'http://carrier3.com/', capability: 'Specific Capability' },
                ],
            });
            expect(jest.requireMock('jsdom').JSDOM).toHaveBeenCalledWith(html);
        });

        it('should return old state if country heading is not found', () => {
            appleEsimMonitor.state = { Chile: [{ name: 'Old Carrier', link: 'old.com', capability: 'General' }] };
            const html = `<html><body><h2>Not Chile</h2></body></html>`;
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const parsedData = appleEsimMonitor.parse(html);
            expect(parsedData).toEqual(appleEsimMonitor.state); // Should return the old state
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not find section for Chile'));
            expect(jest.requireMock('jsdom').JSDOM).toHaveBeenCalledWith(html);
            consoleWarnSpy.mockRestore();
        });

        it('should handle empty carrier list for the country', () => {
            const html = `<html><body><h2>Chile</h2></body></html>`;
            const parsedData = appleEsimMonitor.parse(html);
            expect(parsedData).toEqual({}); // Should return empty object for Chile
            expect(jest.requireMock('jsdom').JSDOM).toHaveBeenCalledWith(html);
        });
    });

    // Test compare method
    describe('compare method', () => {
        const oldCarriers = [
            { name: 'A', link: 'a.com', capability: 'General' },
            { name: 'B', link: 'b.com', capability: 'General' },
        ];
        const newCarriers = [
            { name: 'A', link: 'a.com', capability: 'General' },
            { name: 'C', link: 'c.com', capability: 'General' },
        ];

        beforeEach(() => {
            appleEsimMonitor.state = { Chile: oldCarriers };
        });

        it('should detect added carriers', () => {
            const changes = appleEsimMonitor.compare({ Chile: newCarriers });
            expect(changes.added).toEqual([{ name: 'C', link: 'c.com', capability: 'General' }]);
            expect(changes.removed).toEqual([{ name: 'B', link: 'b.com', capability: 'General' }]);
        });

        it('should detect removed carriers', () => {
            const changes = appleEsimMonitor.compare({ Chile: oldCarriers.filter(c => c.name === 'A') });
            expect(changes.removed).toEqual([{ name: 'B', link: 'b.com', capability: 'General' }]);
            expect(changes.added).toEqual([]);
        });

        it('should detect both added and removed carriers', () => {
            const changes = appleEsimMonitor.compare({ Chile: [{ name: 'D', link: 'd.com', capability: 'General' }] });
            expect(changes.added).toEqual([{ name: 'D', link: 'd.com', capability: 'General' }]);
            expect(changes.removed).toEqual(oldCarriers);
        });

        it('should return null if no changes are detected', () => {
            const changes = appleEsimMonitor.compare({ Chile: oldCarriers });
            expect(changes).toBeNull();
        });

        it('should handle empty old state', () => {
            appleEsimMonitor.state = {};
            const changes = appleEsimMonitor.compare({ Chile: newCarriers });
            expect(changes.added).toEqual(newCarriers);
            expect(changes.removed).toEqual([]);
        });

        it('should handle empty new data', () => {
            const changes = appleEsimMonitor.compare({});
            expect(changes.added).toEqual([]);
            expect(changes.removed).toEqual(oldCarriers);
        });
    });

    // Test notify method
    describe('notify method', () => {
        beforeEach(() => {
            mockChannelSend.mockClear();
            Discord.Client.mock.results[0].value.channels.cache.get.mockClear();
            Discord.MessageEmbed.mockClear();
            mockMessageEmbedInstance.setTitle.mockClear();
            mockMessageEmbedInstance.addField.mockClear();
            mockMessageEmbedInstance.setColor.mockClear();
        });

        it('should send embeds for added carriers', () => {
            const changes = {
                added: [{ name: 'New Carrier', link: 'new.com', capability: 'General' }],
                removed: [],
            };
            appleEsimMonitor.notify(client, changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannelSend).toHaveBeenCalledTimes(1);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('📱 ¡Operador de eSIM agregado en Chile!');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Operador', '[New Carrier](new.com)');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Capacidad', 'General');
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('#4CAF50');
        });

        it('should send embeds for removed carriers', () => {
            const changes = {
                added: [],
                removed: [{ name: 'Old Carrier', link: 'old.com', capability: 'Specific' }],
            };
            appleEsimMonitor.notify(client, changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannelSend).toHaveBeenCalledTimes(1);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('📱 ¡Operador de eSIM eliminado en Chile!');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Operador', '[Old Carrier](old.com)');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Capacidad', 'Specific');
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('#F44336');
        });

        it('should send embeds for both added and removed carriers', () => {
            const changes = {
                added: [{ name: 'New Carrier', link: 'new.com', capability: 'General' }],
                removed: [{ name: 'Old Carrier', link: 'old.com', capability: 'Specific' }],
            };
            appleEsimMonitor.notify(client, changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannelSend).toHaveBeenCalledTimes(2); // One for added, one for removed
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('📱 ¡Operador de eSIM agregado en Chile!');
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('📱 ¡Operador de eSIM eliminado en Chile!');
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const changes = { added: [{ name: 'New', link: 'new.com', capability: 'Gen' }], removed: [] };

            appleEsimMonitor.notify(client, changes);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for AppleEsim.'));
            expect(mockChannelSend).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });
});
