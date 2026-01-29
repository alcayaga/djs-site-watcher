// Mock external modules at the top-level
jest.doMock('../src/storage', () => ({
    read: jest.fn(),
    write: jest.fn(),
    loadSettings: jest.fn().mockReturnValue({
        interval: 5,
        debug: false,
    }),
}));

jest.mock('../src/config', () => ({
    DISCORDJS_TEXTCHANNEL_ID: 'mockChannelId',
    interval: 5,
}));

const SiteMonitor = require('../src/monitors/SiteMonitor');
const Discord = require('discord.js');
const got = require('got');
const { JSDOM } = require('jsdom');
const storage = require('../src/storage');
const crypto = require('crypto');
const diff = require('diff');

// Mock specific external dependencies
jest.mock('got'); // Keep this top-level mock
jest.mock('jsdom');
jest.mock('crypto', () => {
    const mockUpdate = jest.fn().mockReturnThis();
    const mockDigest = jest.fn().mockReturnValue('mock-hash');
    return {
        createHash: jest.fn(() => ({
            update: mockUpdate,
            digest: mockDigest,
        })),
    };
});
jest.mock('diff', () => ({
    diffLines: jest.fn(),
}));

describe('SiteMonitor', () => {
    let client;
    let siteMonitor;
    let mockChannelSend;
    let mockChannel;
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

        jest.spyOn(Discord, 'Client').mockImplementation(() => ({
            channels: {
                cache: {
                    get: jest.fn(() => mockChannel),
                },
            },
        }));
        jest.spyOn(Discord, 'MessageEmbed').mockImplementation(() => mockMessageEmbedInstance);
        // --- End Mock Discord.js components ---

        // Set up process.env for the test
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mockChannelId';

        client = new Discord.Client(); // Instantiate mocked client
        const monitorConfig = {
            file: 'sites.json',
        };
        siteMonitor = new SiteMonitor('site-monitor', monitorConfig);
        siteMonitor.state = [
            {
                id: 'test-site.com',
                url: 'http://test-site.com',
                css: 'body',
                lastChecked: 0,
                lastUpdated: 0,
                hash: 'old-hash',
                lastContent: 'initial content',
            },
        ];
        
        // Clear mocks for other dependencies that might have been called during setup
        storage.read.mockClear();
        storage.write.mockClear();
        crypto.createHash().digest.mockClear();
        JSDOM.mockClear();
        diff.diffLines.mockClear();
    });

    // Existing tests for check method
    it('should detect a change and notify', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify'); // Spy on notify for this test
        const response = { body: 'updated content' };
        got.mockResolvedValue(response); // Override default got mock for this test
        const dom = { window: { document: { querySelector: () => ({ textContent: 'updated content' }), title: 'Test Site' } } };
        JSDOM.mockImplementation(() => dom);
        crypto.createHash().digest.mockReturnValue('new-hash');
        diff.diffLines.mockReturnValue([
            { value: 'initial', removed: true },
            { value: 'updated', added: true },
        ]);


        await siteMonitor.check(client);

        expect(got).toHaveBeenCalledWith('http://test-site.com');
        expect(notifySpy).toHaveBeenCalled(); // Original notify should be called
        expect(storage.write).toHaveBeenCalled();
        notifySpy.mockRestore(); // Clean up spy
    });

    it('should not notify if no change is detected', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify'); // Spy on notify for this test
        const response = { body: 'initial content' };
        got.mockResolvedValue(response); // Override default got mock for this test
        const dom = { window: { document: { querySelector: () => ({ textContent: 'initial content' }), title: 'Test Site' } } };
        JSDOM.mockImplementation(() => dom);
        crypto.createHash().digest.mockReturnValue('old-hash');

        await siteMonitor.check(client);

        expect(got).toHaveBeenCalledWith('http://test-site.com');
        expect(notifySpy).not.toHaveBeenCalled(); // Original notify should not be called
        expect(storage.write).not.toHaveBeenCalled();
        notifySpy.mockRestore(); // Clean up spy
    });

    // New tests for parse method
    describe('parse method', () => {
        it('should do nothing and return undefined', () => {
            expect(siteMonitor.parse()).toBeUndefined();
        });
    });

    // New tests for loadState method
    describe('loadState method', () => {
        it('should load state from storage.read', async () => {
            const mockSites = [{ id: 'site1' }];
            storage.read.mockResolvedValueOnce(mockSites);

            const loadedState = await siteMonitor.loadState();
            expect(storage.read).toHaveBeenCalledWith('sites.json');
            expect(loadedState).toEqual(mockSites);
        });

        it('should return an empty array if storage.read fails', async () => {
            storage.read.mockRejectedValueOnce(new Error('Read error'));
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            const loadedState = await siteMonitor.loadState();
            expect(storage.read).toHaveBeenCalledWith('sites.json');
            expect(loadedState).toEqual([]);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Could not load state for site-monitor'));
            consoleLogSpy.mockRestore();
        });

        it('should return an empty array if storage.read returns non-array', async () => {
            storage.read.mockResolvedValueOnce({}); // non-array value
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            const loadedState = await siteMonitor.loadState();
            expect(storage.read).toHaveBeenCalledWith('sites.json');
            expect(loadedState).toEqual([]);
            expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Could not load state')); // No error logged
            consoleLogSpy.mockRestore();
        });
    });

    // New tests for notify method
    describe('notify method', () => {
        const mockChange = {
            site: {
                id: 'test-site.com',
                url: 'http://test-site.com',
                lastUpdated: 'some-date',
            },
            oldContent: 'old\ncontent',
            newContent: 'new\ncontent',
            dom: { window: { document: { title: 'Test Site Title' } } },
        };

        beforeEach(() => {
            // Clear and reset local mocks for notify tests
            client.channels.cache.get.mockClear();
            mockChannelSend.mockClear();
            Discord.MessageEmbed.mockClear();
            mockMessageEmbedInstance.setTitle.mockClear();
            mockMessageEmbedInstance.addField.mockClear();
            mockMessageEmbedInstance.setColor.mockClear();
        });

        it('should send an embed and diff to the channel', () => {
            diff.diffLines.mockReturnValue([
                { value: 'old', removed: true },
                { value: 'new', added: true },
            ]);
            siteMonitor.notify(client, mockChange);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledWith(mockMessageEmbedInstance);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('🔎 ¡Cambio en Test Site Title!  🐸');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('URL', 'http://test-site.com');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Último cambio', 'some-date', true);
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Actualizado', 'some-date', true);
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('0x6058f3');
            expect(mockChannel.send).toHaveBeenCalledWith(' \n🔴old🟢new\n ');
        });

        it('should format multiline diffs correctly', () => {
            diff.diffLines.mockReturnValue([
                { value: 'line 1\n', common: true },
                { value: 'line 2\n', removed: true },
                { value: 'line three\n', added: true },
                { value: 'line 4', common: true },
            ]);
            siteMonitor.notify(client, mockChange);

            const expectedDiff = ' \n⚪line 1\n🔴line 2\n🟢line three\n⚪line 4\n ';
            expect(mockChannel.send).toHaveBeenCalledWith(expectedDiff);
        });

        it('should truncate long diffs', () => {
            const longContent = 'a'.repeat(2000); // Create sufficiently long content
            diff.diffLines.mockReturnValue([
                { value: longContent, removed: true },
                { value: longContent, added: true },
            ]);
            
            siteMonitor.notify(client, mockChange);
            // Assert that the sent message contains the truncation.
            // The actual logic is in SiteMonitor, we just check if the output includes the truncation string.
            expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('... (truncated)'));
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined); // Simulate channel not found
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            siteMonitor.notify(client, mockChange);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for site-monitor.'));
            expect(mockChannel.send).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
            consoleLogSpy.mockRestore();
        });

        it('should use site.id as title if dom.window.document.title is not available', () => {
            const mockChangeWithoutTitle = {
                site: {
                    id: 'fallback-site-id',
                    url: 'http://test-site.com',
                    lastUpdated: 'some-date',
                },
                oldContent: 'old',
                newContent: 'new',
                dom: { window: { document: { } } }, // No title
            };
            diff.diffLines.mockReturnValue([]); // Avoid diffing errors in this specific test
            siteMonitor.notify(client, mockChangeWithoutTitle);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('🔎 ¡Cambio en fallback-site-id!  🐸');
        });
    });
});