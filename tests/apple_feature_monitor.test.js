const AppleFeatureMonitor = require('../src/monitors/AppleFeatureMonitor');
const Monitor = require('../src/Monitor');
const Discord = require('discord.js');
const got = require('got');

// Mock external modules

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
        it('should send a single detailed embed for 3 or fewer added features', async () => {
            const changes = {
                added: [
                    { featureName: "New Feature", region: "New Region", id: "new-feature" },
                    { featureName: "Existing Feature", region: "New Locale", id: "existing-feature" },
                ],
            };
            await appleFeatureMonitor.notify(changes);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledTimes(1);

            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toBe('🌟 ¡2 nuevas funciones de Apple disponibles! 🐸');
            expect(embed.data.color).toBe('#0071E3');
            expect(embed.addFields).toHaveBeenCalledWith([{
                name: '✨ New Feature',
                value: '📍 New Region\n🔗 http://apple.com/features#new-feature',
                inline: false
            }]);
            expect(embed.addFields).toHaveBeenCalledWith([{
                name: '✨ Existing Feature',
                value: '📍 New Locale\n🔗 http://apple.com/features#existing-feature',
                inline: false
            }]);
        });

        it('should send a single digest embed for more than 3 added features', async () => {
            const changes = {
                added: [
                    { featureName: "Cat A: Feature 1", region: "Reg A", id: "1" },
                    { featureName: "Cat A: Feature 2", region: "Reg A", id: "2" },
                    { featureName: "Cat B: Feature 3", region: "Reg B", id: "3" },
                    { featureName: "Cat B: Feature 4", region: "Reg B", id: "4" },
                ],
            };
            await appleFeatureMonitor.notify(changes);

            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toBe('🌟 ¡4 nuevas funciones de Apple disponibles! 🐸');
            expect(embed.data.color).toBe('#0071E3');
            expect(embed.setDescription).toHaveBeenCalledWith(expect.stringContaining('Se han detectado nuevas funciones para: **Reg A**, **Reg B**'));
            expect(embed.setDescription).toHaveBeenCalledWith(expect.stringContaining('- **Cat A** (2): Feature 1, Feature 2'));
            expect(embed.setDescription).toHaveBeenCalledWith(expect.stringContaining('- **Cat B** (2): Feature 3, Feature 4'));
        });

        it('should group colon-free feature names under fallback category "Otras" in digest mode', async () => {
            const changes = {
                added: [
                    { featureName: "Just Feature 1", region: "Reg A", id: "1" },
                    { featureName: "Just Feature 2", region: "Reg A", id: "2" },
                    { featureName: "Just Feature 3", region: "Reg B", id: "3" },
                    { featureName: "Just Feature 4", region: "Reg C", id: "4" },
                ],
            };
            await appleFeatureMonitor.notify(changes);

            // mockChannel is cleared before each test
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toBe('🌟 ¡4 nuevas funciones de Apple disponibles! 🐸');
            expect(embed.setDescription).toHaveBeenCalledWith(expect.stringContaining('- **Otras** (4): Just Feature 1, Just Feature 2, Just Feature 3, Just Feature 4'));
        });

        it('should send a detailed embed for each removed feature/region', async () => {
            const changes = {
                removed: [
                    { featureName: "Old Feature", region: "Old Region", id: "old-feature" },
                ],
            };
            await appleFeatureMonitor.notify(changes);

            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            const embed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(embed.data.title).toBe('🚫 ¡Función de Apple eliminada! 🐸');
            expect(embed.data.color).toBe('#F44336');
            expect(embed.addFields).toHaveBeenCalledWith([{
                name: '✨ Old Feature',
                value: '📍 Old Region\n🔗 http://apple.com/features#old-feature',
                inline: false
            }]);
        });

        it('should log an error if notification channel not found', async () => {
            client.channels.cache.get.mockReturnValueOnce(undefined);
            const changes = { added: [{ featureName: "Test", region: "Test", id: "test" }] };

            await appleFeatureMonitor.notify(changes);

            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for %s.'), 'AppleFeature');
            expect(mockChannel.send).not.toHaveBeenCalled();
        });
    });

    describe('Multi-OS robust parsing', () => {
        it('should parse nested .features .section-content structures independently', () => {
            const html = `
                <html>
                <body>
                    <div class="features" id="nested-features">
                        <div class="section-content">
                            <h2>Feature 1</h2>
                            <ul><li>Chile</li></ul>
                        </div>
                        <div class="section-content">
                            <h2>Feature 2</h2>
                            <ul><li>Chile</li></ul>
                        </div>
                    </div>
                </body>
                </html>
            `;
            const parsed = appleFeatureMonitor.parse(html);
            expect(parsed['Feature 1']).toBeDefined();
            expect(parsed['Feature 1'].id).toBe('nested-features');
            expect(parsed['Feature 2']).toBeDefined();
            expect(parsed['Feature 2'].id).toBe('nested-features');
        });

        it('should parse macOS HTML structure (.features with h4)', () => {
            const html = `
                <html>
                <body>
                    <div class="features" id="macos-feat">
                        <div class="section-content">
                            <h4>macOS Feature</h4>
                            <ul><li>Chile</li></ul>
                        </div>
                    </div>
                </body>
                </html>
            `;
            const parsed = appleFeatureMonitor.parse(html);
            expect(parsed['macOS Feature']).toBeDefined();
            expect(parsed['macOS Feature'].regions).toContain('Chile');
        });

        it('should parse watchOS HTML structure (.section-content with h2 in table-heading)', () => {
            const html = `
                <html>
                <body>
                    <div class="section-content" id="watchos-feat">
                        <div class="table-heading">
                            <h2>watchOS Feature</h2>
                        </div>
                        <div class="table-body">
                            <ul><li>Chile</li></ul>
                        </div>
                    </div>
                </body>
                </html>
            `;
            const parsed = appleFeatureMonitor.parse(html);
            expect(parsed['watchOS Feature']).toBeDefined();
            expect(parsed['watchOS Feature'].regions).toContain('Chile');
        });
    });

    describe('Fresh Install & Migration logic', () => {
        it('should flag isFreshInstall if state file is completely absent', async () => {
            const storage = require('../src/storage');
            storage.read = jest.fn().mockResolvedValue({});
            storage.write = jest.fn().mockResolvedValue();
            const fs = require('fs');
            jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
                if (path === appleFeatureMonitor.config.file) return false;
                return false;
            });

            await appleFeatureMonitor.loadState();
            expect(appleFeatureMonitor.isFreshInstall).toBe(true);
        });

        it('should migrate legacy file for AppleFeature:iOS', async () => {
            appleFeatureMonitor.name = 'AppleFeature:iOS';
            appleFeatureMonitor.config.file = './config/apple_features_ios.json';
            
            // Mock that new file doesn't exist, but legacy one does
            const fs = require('fs');
            jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
                if (path === appleFeatureMonitor.config.file) return false;
                if (path === './config/apple_features.json') return true;
                return false;
            });

            const legacyState = { "Legacy": { regions: ["Chile"], id: "1" } };
            const fsExtra = require('fs-extra');
            jest.spyOn(fsExtra, 'readJSON').mockResolvedValue(legacyState);
            const storage = require('../src/storage');
            storage.write = jest.fn().mockResolvedValue();

            const state = await appleFeatureMonitor.loadState();
            expect(state).toEqual(legacyState);
            expect(storage.write).toHaveBeenCalledWith(appleFeatureMonitor.config.file, legacyState);
            expect(appleFeatureMonitor.isFreshInstall).toBeFalsy();
        });

        it('should flag isFreshInstall if migrated legacy file is empty', async () => {
            appleFeatureMonitor.name = 'AppleFeature:iOS';
            const fs = require("fs");

            
            jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
                if (path === appleFeatureMonitor.config.file) return false;
                if (path === './config/apple_features.json') return true;
                return false;
            });

            const storage = require("../src/storage");

            const emptyLegacyState = {};
            const fsExtra = require('fs-extra');
            jest.spyOn(fsExtra, 'readJSON').mockResolvedValue(emptyLegacyState);
            storage.write = jest.fn().mockResolvedValue();

            const state = await appleFeatureMonitor.loadState();
            expect(state).toEqual(emptyLegacyState);
            expect(storage.write).toHaveBeenCalledWith(appleFeatureMonitor.config.file, emptyLegacyState);
            expect(appleFeatureMonitor.isFreshInstall).toBe(true);
        });

        it('should handle readJSON failure during legacy migration by setting isFreshInstall and returning empty state', async () => {
            appleFeatureMonitor.name = 'AppleFeature:iOS';
            appleFeatureMonitor.config.file = './config/apple_features_ios.json';
            
            const fs = require("fs");
            jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
                if (path === appleFeatureMonitor.config.file) return false;
                if (path === './config/apple_features.json') return true;
                return false;
            });

            const fsExtra = require('fs-extra');
            jest.spyOn(fsExtra, 'readJSON').mockRejectedValue(new Error('Permission denied'));
            const storage = require("../src/storage");
            storage.write = jest.fn().mockResolvedValue();

            let state = await appleFeatureMonitor.loadState();
            expect(state).toEqual({});
            expect(storage.write).not.toHaveBeenCalled();
            expect(appleFeatureMonitor.isFreshInstall).toBe(true);

            // Retry with non-empty data
            const legacyState = { "Legacy": { regions: ["Chile"], id: "1" } };
            jest.spyOn(fsExtra, 'readJSON').mockResolvedValue(legacyState);
            
            state = await appleFeatureMonitor.loadState();
            expect(state).toEqual(legacyState);
            expect(storage.write).toHaveBeenCalledWith(appleFeatureMonitor.config.file, legacyState);
            expect(appleFeatureMonitor.isFreshInstall).toBe(false);
        });

        it('should normalize legacy state keys and regions during migration', async () => {
            appleFeatureMonitor.name = 'AppleFeature:iOS';
            appleFeatureMonitor.config.file = './config/apple_features_ios.json';
            
            const fs = require("fs");
            jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
                if (path === appleFeatureMonitor.config.file) return false;
                if (path === './config/apple_features.json') return true;
                return false;
            });

            const rawLegacyState = { 
                "Apple\xA0Intelligence": { regions: ["Spanish\xA0(Chile)"], id: "1" },
                "Apple Intelligence": { regions: ["US"], id: "2" },
                "Other Feature": { regions: ["Chile", " Chile "], id: "3" }
            };
            const expectedState = { 
                "Apple Intelligence": { regions: ["Spanish (Chile)", "US"], id: "1" },
                "Other Feature": { regions: ["Chile"], id: "3" }
            };

            const fsExtra = require('fs-extra');
            jest.spyOn(fsExtra, 'readJSON').mockResolvedValue(rawLegacyState);
            const storage = require("../src/storage");
            storage.write = jest.fn().mockResolvedValue();

            const state = await appleFeatureMonitor.loadState();
            expect(state).toEqual(expectedState);
            expect(storage.write).toHaveBeenCalledWith(appleFeatureMonitor.config.file, expectedState);
        });

        it('should return empty changes in compare() when isFreshInstall is true to prevent spam', () => {
            appleFeatureMonitor.isFreshInstall = true;
            const changes = appleFeatureMonitor.compare({ "New Feature": { regions: ["Chile"], id: "1" } });
            
            expect(changes).toEqual({ added: [], removed: [] });
            expect(appleFeatureMonitor.isFreshInstall).toBeFalsy(); // Flag should be cleared
        });
    });
});
