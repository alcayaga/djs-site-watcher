const AppleFeatureMonitor = require('../src/monitors/AppleFeatureMonitor');
const Monitor = require('../src/Monitor');
// const { JSDOM } = require('jsdom'); // Comment out direct import
const Discord = require('discord.js');
const got = require('got');
require('../src/storage'); // Only require, no assignment

// Mock external modules
jest.mock('jsdom', () => {
    return {
        JSDOM: jest.fn((html) => {
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
jest.mock('../src/storage');
jest.mock('../src/config', () => ({
    DISCORDJS_TEXTCHANNEL_ID: 'mockChannelId',
    interval: 5,
}));

describe('AppleFeatureMonitor', () => {
    let client;
    let appleFeatureMonitor;
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

        // JSDOM mock implementation is handled by the jest.mock('jsdom') block.
        jest.requireMock('jsdom').JSDOM.mockClear();

        client = new Discord.Client();
        monitorConfig = { keywords: ['chile', 'spanish'], url: 'http://apple.com/features', file: 'apple_feature.json' };
        appleFeatureMonitor = new AppleFeatureMonitor('AppleFeature', monitorConfig);
        appleFeatureMonitor.client = client; // Manually set client for testing check method

        // Default got mock
        got.mockResolvedValue({ body: '<html></html>' });
    });

    // Test parse method
    describe('parse method', () => {
        it('should parse HTML and extract features with matching keywords', () => {
            const html = `
                <html>
                <body>
                    <div class="features" id="feature-a">
                        <h2>Feature A</h2>
                        <ul>
                            <li>Region 1</li>
                            <li>Chile</li>
                            <li>Spanish (Chile)</li>
                        </ul>
                    </div>
                    <div class="features" id="feature-b">
                        <h2>Feature B</h2>
                        <ul>
                            <li>Region 3</li>
                            <li>English</li>
                        </ul>
                    </div>
                </body>
                </html>
            `;
            const parsedData = appleFeatureMonitor.parse(html);
            expect(parsedData).toEqual({
                "Feature A": {
                    regions: ["Chile", "Spanish (Chile)"],
                    id: "feature-a",
                },
            });
            expect(jest.requireMock('jsdom').JSDOM).toHaveBeenCalledWith(html);
        });

        it('should return empty object if no features match keywords', () => {
            const html = `
                <html>
                <body>
                    <div class="features" id="feature-c">
                        <h2>Feature C</h2>
                        <ul>
                            <li>Region X</li>
                            <li>Germany</li>
                        </ul>
                    </div>
                </body>
                </html>
            `;
            const parsedData = appleFeatureMonitor.parse(html);
            expect(parsedData).toEqual({});
        });

        it('should return empty object if no features elements are found', () => {
            const html = `<html><body><div>No features here</div></body></html>`;
            const parsedData = appleFeatureMonitor.parse(html);
            expect(parsedData).toEqual({});
        });
    });

    // Test compare method
    describe('compare method', () => {
        const oldState = {
            "Feature 1": { regions: ["Region A"], id: "feature-1" },
            "Feature 2": { regions: ["Region X", "Region Y"], id: "feature-2" },
        };

        beforeEach(() => {
            appleFeatureMonitor.state = oldState;
        });

        it('should detect a completely new feature', () => {
            const newState = {
                ...oldState,
                "Feature 3": { regions: ["Region C"], id: "feature-3" },
            };
            const changes = appleFeatureMonitor.compare(newState);
            expect(changes.added).toEqual([
                { featureName: "Feature 3", region: "Region C", id: "feature-3" },
            ]);
        });

        it('should detect a new region for an existing feature', () => {
            const newState = {
                ...oldState,
                "Feature 1": { regions: ["Region A", "Region B"], id: "feature-1" },
            };
            const changes = appleFeatureMonitor.compare(newState);
            expect(changes.added).toEqual([
                { featureName: "Feature 1", region: "Region B", id: "feature-1" },
            ]);
        });

        it('should return null if no changes are detected', () => {
            const changes = appleFeatureMonitor.compare(oldState);
            expect(changes).toBeNull();
        });

        it('should handle empty old state', () => {
            appleFeatureMonitor.state = {};
            const newState = { "Feature 4": { regions: ["Region D"], id: "feature-4" } };
            const changes = appleFeatureMonitor.compare(newState);
            expect(changes.added).toEqual([
                { featureName: "Feature 4", region: "Region D", id: "feature-4" },
            ]);
        });
    });

    // Test saveState method
    describe('saveState method', () => {
        it('should merge new state with existing state before calling super.saveState', async () => {
            appleFeatureMonitor.state = { "Existing Feature": { regions: ["Old"], id: "exist-1" } };
            const newState = { "New Feature": { regions: ["New"], id: "new-1" } };
            const expectedMergedState = {
                "Existing Feature": { regions: ["Old"], id: "exist-1" },
                "New Feature": { regions: ["New"], id: "new-1" },
            };
            
            jest.spyOn(Monitor.prototype, 'saveState').mockResolvedValue();

            await appleFeatureMonitor.saveState(newState);

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

        it('should send embeds for each added feature/region', () => {
            const changes = {
                added: [
                    { featureName: "New Feature", region: "New Region", id: "new-feature" },
                    { featureName: "Existing Feature", region: "New Locale", id: "existing-feature" },
                ],
            };
            appleFeatureMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannelSend).toHaveBeenCalledTimes(2); // One for each added item

            // Check first embed
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('🌟 ¡Nueva función de Apple disponible! 🐸');
            expect(mockMessageEmbedInstance.addFields).toHaveBeenCalledWith([
                { name: '✨ Función', value: 'New Feature', inline: true },
                { name: '📍 Región/Idioma', value: 'New Region', inline: true },
                { name: '🔗 URL', value: 'http://apple.com/features#new-feature' }
            ]);
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('#0071E3');

            // Need to ensure the second embed was also created/sent
            // This is tricky with current mocking, as mockMessageEmbedInstance is a singleton.
            // A more robust mock would return new instances of MessageEmbed.
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const changes = { added: [{ featureName: "Test", region: "Test", id: "test" }] };

            appleFeatureMonitor.notify(changes);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for AppleFeature.'));
            expect(mockChannelSend).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });
});
