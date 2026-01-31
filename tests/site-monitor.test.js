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
const storage = require('../src/storage');
const crypto = require('crypto');
const diff = require('diff');

// Mock specific external dependencies
// Removed jest.mock('dns') to avoid breaking got
jest.mock('got'); // Keep this top-level mock
jest.mock('jsdom', () => {
    return {
        JSDOM: jest.fn((html) => {
            const actualDom = new (jest.requireActual('jsdom').JSDOM)(html);
            return {
                window: {
                    document: {
                        querySelector: jest.fn((selector) => actualDom.window.document.querySelector(selector)),
                        title: actualDom.window.document.title,
                    },
                },
            };
        }),
    };
});
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
        diff.diffLines.mockClear();
    });

    // Existing tests for check method
    it('should detect a change and notify', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify'); // Spy on notify for this test
        // Updated: Provide real HTML for JSDOM to parse
        const response = { body: '<html><head><title>Test Site</title></head><body>updated content</body></html>' };
        got.mockResolvedValue(response); 
        // Removed: JSDOM.mockImplementation calls. The global mock handles it.
        
        crypto.createHash().digest.mockReturnValue('new-hash');
        diff.diffLines.mockReturnValue([
            { value: 'initial', removed: true },
            { value: 'updated', added: true },
        ]);


        await siteMonitor.check(client);

        expect(got).toHaveBeenCalledWith('http://test-site.com', expect.any(Object));
        expect(notifySpy).toHaveBeenCalled(); // Original notify should be called
        expect(storage.write).toHaveBeenCalled();
        notifySpy.mockRestore(); // Clean up spy
    });

    it('should not notify if no change is detected', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify'); // Spy on notify for this test
        const response = { body: '<html><head><title>Test Site</title></head><body>initial content</body></html>' };
        got.mockResolvedValue(response); 
        
        crypto.createHash().digest.mockReturnValue('old-hash');

        await siteMonitor.check(client);

        expect(got).toHaveBeenCalledWith('http://test-site.com', expect.any(Object));
        expect(notifySpy).not.toHaveBeenCalled(); // Original notify should not be called
        expect(storage.write).not.toHaveBeenCalled();
        notifySpy.mockRestore(); // Clean up spy
    });

    it('should backfill lastContent if it is missing but hash matches (Silent Migration)', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        // Setup: Site has valid hash but NO lastContent (legacy state)
        const legacySite = {
            id: 'legacy-site.com',
            url: 'http://legacy-site.com',
            css: 'body',
            lastChecked: 0,
            lastUpdated: 0,
            hash: 'valid-hash',
            // lastContent is MISSING
        };
        siteMonitor.state = [legacySite];

        const responseContent = 'some content';
        const html = `<html><body>${responseContent}</body></html>`;
        got.mockResolvedValue({ body: html });
        
        // Ensure hash matches
        crypto.createHash().digest.mockReturnValue('valid-hash');

        await siteMonitor.check(client);

        expect(siteMonitor.state[0].lastContent).toBe(responseContent);
        expect(storage.write).toHaveBeenCalled();
        expect(notifySpy).not.toHaveBeenCalled();
        notifySpy.mockRestore();
    });

    it('should NOT backfill lastContent if it is present but empty string', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        // Setup: Site has valid hash and lastContent is empty string (valid state)
        const siteWithEmptyContent = {
            id: 'empty-site.com',
            url: 'http://empty-site.com',
            css: 'body',
            lastChecked: 0,
            lastUpdated: 0,
            hash: 'd41d8cd98f00b204e9800998ecf8427e', // MD5 of empty string
            lastContent: '' 
        };
        siteMonitor.state = [siteWithEmptyContent];

        const responseContent = '';
        const html = `<html><body>${responseContent}</body></html>`;
        got.mockResolvedValue({ body: html });
        
        crypto.createHash().digest.mockReturnValue('d41d8cd98f00b204e9800998ecf8427e');

        await siteMonitor.check(client);

        expect(storage.write).not.toHaveBeenCalled();
        expect(notifySpy).not.toHaveBeenCalled();
        notifySpy.mockRestore();
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
            siteMonitor.client = client; // Ensure client is set on instance
        });

        it('should send an embed and diff to the channel', () => {
            diff.diffLines.mockReturnValue([
                { value: 'old', removed: true },
                { value: 'new', added: true },
            ]);
            siteMonitor.notify(mockChange);

            expect(client.channels.cache.get).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannel.send).toHaveBeenCalledWith(mockMessageEmbedInstance);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('🔎 ¡Cambio en Test Site Title!  🐸');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('URL', 'http://test-site.com');
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Último cambio', 'some-date', true);
            expect(mockMessageEmbedInstance.addField).toHaveBeenCalledWith('Actualizado', 'some-date', true);
            expect(mockMessageEmbedInstance.setColor).toHaveBeenCalledWith('0x6058f3');
            expect(mockChannel.send).toHaveBeenCalledWith(' \n🔴 old\n🟢 new\n\n ');
        });

        it('should format multiline diffs correctly', () => {
            diff.diffLines.mockReturnValue([
                { value: 'line 1\n', common: true },
                { value: 'line 2\n', removed: true },
                { value: 'line three\n', added: true },
                { value: 'line 4', common: true },
            ]);
            siteMonitor.notify(mockChange);

            const expectedDiff = ' \n⚪ line 1\n🔴 line 2\n🟢 line three\n⚪ line 4\n\n ';
            expect(mockChannel.send).toHaveBeenCalledWith(expectedDiff);
        });

        it('should truncate long diffs', () => {
            const longContent = 'a'.repeat(2000); // Create sufficiently long content
            diff.diffLines.mockReturnValue([
                { value: longContent, removed: true },
                { value: longContent, added: true },
            ]);
            
            siteMonitor.notify(mockChange);
            // Assert that the sent message contains the truncation.
            // The actual logic is in SiteMonitor, we just check if the output includes the truncation string.
            expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('... (truncated)'));
        });

        it('should log an error if notification channel not found', () => {
            client.channels.cache.get.mockReturnValueOnce(undefined); // Simulate channel not found
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            siteMonitor.notify(mockChange);

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
            siteMonitor.notify(mockChangeWithoutTitle);
            expect(mockMessageEmbedInstance.setTitle).toHaveBeenCalledWith('🔎 ¡Cambio en fallback-site-id!  🐸');
        });
    });

    // New tests for fetchAndProcess method
    describe('fetchAndProcess method', () => {
        it('should fetch, clean, and hash content', async () => {
            const rawContent = '  content  \n';
            const html = `<html><body>${rawContent}</body></html>`;
            got.mockResolvedValue({ body: html });
            
            // Expected clean content: "content"
            // Expected hash: MD5("content")
            crypto.createHash().digest.mockReturnValue('mock-hash-clean');

            const result = await siteMonitor.fetchAndProcess('http://example.com', 'body');

            expect(got).toHaveBeenCalledWith('http://example.com', expect.any(Object));
            expect(result.content).toBe('content');
            expect(result.hash).toBe('mock-hash-clean');
            expect(result.dom).toBeDefined();
            expect(result.selectorFound).toBe(true);
        });
    });

    // New tests for addSite method
    describe('addSite method', () => {
        it('should add a new site, save state, and return site object', async () => {
            const rawContent = 'content';
            const html = `<html><body>${rawContent}</body></html>`;
            got.mockResolvedValue({ body: html });
            crypto.createHash().digest.mockReturnValue('mock-hash');

            const { site, warning } = await siteMonitor.addSite('http://new-site.com', 'body');

            expect(site.url).toBe('http://new-site.com');
            expect(site.lastContent).toBe('content'); // Should be cleaned (though 'content' is already clean)
            expect(site.hash).toBe('mock-hash');
            expect(warning).toBe(false);

            expect(siteMonitor.state).toHaveLength(2); // Initial 1 + new 1
            expect(siteMonitor.state[1]).toBe(site);
            expect(storage.write).toHaveBeenCalledWith('sites.json', siteMonitor.state);
        });

        it('should return warning if selector not found', async () => {
            const html = `<html><body>content</body></html>`;
            got.mockResolvedValue({ body: html });
            
            // Mock querySelector to return null for the specific selector
            // Note: Our top-level mock for JSDOM might need adjustment or we rely on specific behavior
            // The top-level mock:
            // querySelector: jest.fn((selector) => actualDom.window.document.querySelector(selector))
            // This runs against actual JSDOM of the HTML string.
            // If we search for a non-existent selector, it returns null.

            const { site, warning } = await siteMonitor.addSite('http://new-site.com', '#non-existent');

            expect(warning).toBe(true);
            expect(site.css).toBe('#non-existent');
            // lastContent should be empty string if selector not found (logic in fetchAndProcess -> selector ? text : '')
            expect(site.lastContent).toBe(''); 
        });

        it('should not add a duplicate site', async () => {
            const existingSite = siteMonitor.state[0];
            const { site } = await siteMonitor.addSite(existingSite.url, existingSite.css);

            expect(site).toBe(existingSite);
            expect(siteMonitor.state).toHaveLength(1);
            expect(storage.write).not.toHaveBeenCalled();
        });
    });
});