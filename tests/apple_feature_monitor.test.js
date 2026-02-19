const AppleFeatureMonitor = require('../src/monitors/AppleFeatureMonitor');
const Monitor = require('../src/Monitor');
const Discord = require('discord.js');
const got = require('got');

// Mock external modules
jest.mock('jsdom');
jest.mock('discord.js');
jest.mock('got');
jest.mock('../src/storage');
jest.mock('../src/config');
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

const logger = require('../src/utils/logger');

describe('AppleFeatureMonitor', () => {
    let client;
    let appleFeatureMonitor;
    let monitorConfig;
    let mockChannel;

    beforeEach(() => {
        jest.clearAllMocks();

        client = new Discord.Client();
        mockChannel = client.channels.cache.get('mockChannelId');

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

        it('should detect removed features and regions', () => {
            appleFeatureMonitor.state = {
                "Feature 1": { regions: ["Region A", "Region B"], id: "feature-1" },
                "Feature 2": { regions: ["Region C"], id: "feature-2" },
            };
            const newState = {
                "Feature 1": { regions: ["Region A"], id: "feature-1" },
            };
            const changes = appleFeatureMonitor.compare(newState);
            expect(changes.removed).toHaveLength(2);
            expect(changes.removed).toContainEqual({ featureName: "Feature 1", region: "Region B", id: "feature-1" });
            expect(changes.removed).toContainEqual({ featureName: "Feature 2", region: "Region C", id: "feature-2" });
        });
    });

    // Test saveState method
    describe('saveState method', () => {
        it('should overwrite state with new state (no merge) to prevent stale state', async () => {
            appleFeatureMonitor.state = { "Existing Feature": { regions: ["Old"], id: "exist-1" } };
            const newState = { "New Feature": { regions: ["New"], id: "new-1" } };
            
            jest.spyOn(Monitor.prototype, 'saveState').mockResolvedValue();

            await appleFeatureMonitor.saveState(newState);

            expect(Monitor.prototype.saveState).toHaveBeenCalledWith(newState);
        });
    });

    // Test notify method
    describe('notify method', () => {
        it('should send embeds for each added feature/region', () => {
            const changes = {
                added: [
                    { featureName: "New Feature", region: "New Region", id: "new-feature" },
                    { featureName: "Existing Feature", region: "New Locale", id: "existing-feature" },
                ],
            };
            appleFeatureMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(2); // One for each added item

            // Check first embed
            const firstEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(firstEmbed.data.title).toBe('🌟 ¡Nueva función de Apple disponible! 🐸');
            expect(firstEmbed.addFields).toHaveBeenCalledWith([
                { name: '✨ Función', value: 'New Feature', inline: true },
                { name: '📍 Región/Idioma', value: 'New Region', inline: true },
                { name: '🔗 URL', value: 'http://apple.com/features#new-feature' }
            ]);
            expect(firstEmbed.data.color).toBe('#0071E3');

            // Check second embed
            const secondEmbed = mockChannel.send.mock.calls[1][0].embeds[0];
            expect(secondEmbed.data.title).toBe('🌟 ¡Nueva función de Apple disponible! 🐸');
            expect(secondEmbed.addFields).toHaveBeenCalledWith([
                { name: '✨ Función', value: 'Existing Feature', inline: true },
                { name: '📍 Región/Idioma', value: 'New Locale', inline: true },
                { name: '🔗 URL', value: 'http://apple.com/features#existing-feature' }
            ]);
            expect(secondEmbed.data.color).toBe('#0071E3');
        });

        it('should send embeds for each removed feature/region', () => {
            const changes = {
                removed: [
                    { featureName: "Old Feature", region: "Old Region", id: "old-feature" },
                ],
            };
            appleFeatureMonitor.notify(changes);

            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toContain('Función de Apple eliminada');
            expect(embed.data.color).toBe('#F44336');
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const changes = { added: [{ featureName: "Test", region: "Test", id: "test" }] };

            appleFeatureMonitor.notify(changes);

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for AppleFeature.'));
            expect(mockChannel.send).not.toHaveBeenCalled();
        });
    });
});
