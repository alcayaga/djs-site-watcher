const AppleEsimMonitor = require('../src/monitors/AppleEsimMonitor');
const Discord = require('discord.js');
const got = require('got');

// Mock external modules
jest.mock('jsdom');
jest.mock('discord.js');
jest.mock('got');
jest.mock('../src/storage');
jest.mock('../src/config');

describe('AppleEsimMonitor', () => {
    let client;
    let appleEsimMonitor;
    let monitorConfig;
    let mockChannel;

    beforeEach(() => {
        jest.clearAllMocks();

        client = new Discord.Client();
        mockChannel = client.channels.cache.get('mockChannelId');

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
            mockChannel.send.mockClear();
            Discord.EmbedBuilder.mockClear();
        });

        it('should send embeds for added carriers', () => {
            const changes = {
                added: [{ name: 'New Carrier', link: 'new.com', capability: 'General' }],
                removed: [],
            };
            appleEsimMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            
            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toBe('📱 ¡Operador de eSIM agregado en Chile! 🐸');
            expect(embed.addFields).toHaveBeenCalledWith([
                { name: '📡 Operador', value: '[New Carrier](new.com)', inline: true },
                { name: '✨ Capacidad', value: 'General', inline: true }
            ]);
            expect(embed.data.color).toBe('#4CAF50');
        });

        it('should send embeds for removed carriers', () => {
            const changes = {
                added: [],
                removed: [{ name: 'Old Carrier', link: 'old.com', capability: 'Specific' }],
            };
            appleEsimMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            
            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toBe('📱 ¡Operador de eSIM eliminado en Chile! 🐸');
            expect(embed.addFields).toHaveBeenCalledWith([
                { name: '📡 Operador', value: '[Old Carrier](old.com)', inline: true },
                { name: '✨ Capacidad', value: 'Specific', inline: true }
            ]);
            expect(embed.data.color).toBe('#F44336');
        });

        it('should send embeds for both added and removed carriers', () => {
            const changes = {
                added: [{ name: 'New Carrier', link: 'new.com', capability: 'General' }],
                removed: [{ name: 'Old Carrier', link: 'old.com', capability: 'Specific' }],
            };
            appleEsimMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(2);
            
            const addedEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(addedEmbed.data.title).toBe('📱 ¡Operador de eSIM agregado en Chile! 🐸');
            
            const removedEmbed = mockChannel.send.mock.calls[1][0].embeds[0];
            expect(removedEmbed.data.title).toBe('📱 ¡Operador de eSIM eliminado en Chile! 🐸');
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const changes = { added: [{ name: 'New', link: 'new.com', capability: 'Gen' }], removed: [] };

            appleEsimMonitor.notify(changes);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for AppleEsim.'));
            expect(mockChannel.send).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });
});
