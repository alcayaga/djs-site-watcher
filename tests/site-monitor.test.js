const SiteMonitor = require('../src/monitors/SiteMonitor');
const Discord = require('discord.js');
const got = require('got');
const storage = require('../src/storage');
const crypto = require('crypto');
const diff = require('diff');

// Use manual mocks from __mocks__ and src/__mocks__
jest.mock('discord.js');
jest.mock('got');
jest.mock('jsdom');
jest.mock('crypto');
jest.mock('diff');
jest.mock('../src/storage');
jest.mock('../src/config');

describe('SiteMonitor', () => {
    let client;
    let siteMonitor;
    let mockChannel;

    beforeEach(() => {
        jest.restoreAllMocks(); // Restore all mocks to original implementation
        jest.clearAllMocks(); // Clear call history

        // Setup Discord Client and Channel from the manual mock
        client = new Discord.Client();
        // Access the shared mock channel instance from the client
        mockChannel = client.channels.cache.get('mockChannelId');
        
        // Reset specific mock implementations if needed by tests
        storage.read.mockClear();
        storage.write.mockClear();
        
        const monitorConfig = {
            file: 'sites.json',
        };
        siteMonitor = new SiteMonitor('site-monitor', monitorConfig);
        siteMonitor.client = client; // Ensure client is attached
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
    });

    // Existing tests for check method
    it('should detect a change and notify', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        
        const response = { body: '<html><head><title>Test Site</title></head><body>updated content</body></html>' };
        got.mockResolvedValue(response);
        
        crypto._mockDigest.mockReturnValue('new-hash');
        diff.diffLines.mockReturnValue([
            { value: 'initial', removed: true },
            { value: 'updated', added: true },
        ]);

        await siteMonitor.check();

        // Expect got called with safe options (which are now default in Monitor)
        expect(got).toHaveBeenCalledWith('http://test-site.com', expect.anything());
        expect(notifySpy).toHaveBeenCalled();
        expect(storage.write).toHaveBeenCalled();
    });

    it('should not notify if no change is detected', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        
        // Match the title to avoid migration triggering storage.write
        siteMonitor.state[0].id = 'Test Site';
        const response = { body: '<html><head><title>Test Site</title></head><body>initial content</body></html>' };
        got.mockResolvedValue(response);
        
        crypto._mockDigest.mockReturnValue('old-hash');

        await siteMonitor.check();

        expect(got).toHaveBeenCalledWith('http://test-site.com', expect.anything());
        expect(notifySpy).not.toHaveBeenCalled();
        expect(storage.write).not.toHaveBeenCalled();
    });

    it('should backfill lastContent if it is missing but hash matches (Silent Migration)', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        const legacySite = {
            id: 'legacy-site.com',
            url: 'http://legacy-site.com',
            css: 'body',
            lastChecked: 0,
            lastUpdated: 0,
            hash: 'valid-hash',
        };
        siteMonitor.state = [legacySite];

        const responseContent = 'some content';
        const html = `<html><body>${responseContent}</body></html>`;
        got.mockResolvedValue({ body: html });
        
        crypto._mockDigest.mockReturnValue('valid-hash');

        await siteMonitor.check();

        expect(siteMonitor.state[0].lastContent).toBe(responseContent);
        expect(storage.write).toHaveBeenCalled();
        expect(notifySpy).not.toHaveBeenCalled();
    });

    it('should NOT backfill lastContent if it is present but empty string', async () => {
        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        const siteWithEmptyContent = {
            id: 'empty-site.com',
            url: 'http://empty-site.com',
            css: 'body',
            lastChecked: 0,
            lastUpdated: 0,
            hash: 'd41d8cd98f00b204e9800998ecf8427e',
            lastContent: '' 
        };
        siteMonitor.state = [siteWithEmptyContent];

        const responseContent = '';
        const html = `<html><body>${responseContent}</body></html>`;
        got.mockResolvedValue({ body: html });
        
        crypto._mockDigest.mockReturnValue('d41d8cd98f00b204e9800998ecf8427e');

        await siteMonitor.check();

        expect(storage.write).not.toHaveBeenCalled();
        expect(notifySpy).not.toHaveBeenCalled();
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
            expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Could not load state')); 
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
            // Reset mock channel for notify tests
            mockChannel.send.mockClear();
        });

        it('should send an embed and diff to the channel', () => {
            diff.diffLines.mockReturnValue([
                { value: 'old', removed: true },
                { value: 'new', added: true },
            ]);
            siteMonitor.notify(mockChange);

            // Access the mock EmbedBuilder instance
            // Since we mocked Discord.EmbedBuilder, getting the instance is tricky if we don't have a handle.
            // But the manual mock `__mocks__/discord.js.js` exports `EmbedBuilder` as a jest.fn.
            // We can check the calls to the constructor or the instances.
            // However, the manual mock logic says `this.data = {}` and methods update it.
            // But `siteMonitor.notify` creates a NEW instance: `new Discord.EmbedBuilder()`.
            // The `mockChannel.send` receives this instance.
            
            expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
                embeds: expect.any(Array)
            }));
            
            const sentEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
            // The manual mock's methods return `this`. So we can check the `data` property if we want, or just spies.
            // The manual mock `__mocks__/discord.js.js` implements methods that write to `this.data`.
            
            expect(sentEmbed.data.title).toBe('¡Cambio en Test Site Title!  🐸');
            expect(sentEmbed.data.fields).toEqual(expect.arrayContaining([
                { name: '🔗 URL', value: 'http://test-site.com' },
                { name: '🕒 Último cambio', value: '`some-date`', inline: true },
                { name: '📝 Cambios detectados', value: '```diff\n🔴 old\n🟢 new\n```' }
            ]));
        });

        it('should format multiline diffs correctly', () => {
            diff.diffLines.mockReturnValue([
                { value: 'line 1\n', common: true },
                { value: 'line 2\n', removed: true },
                { value: 'line three\n', added: true },
                { value: 'line 4', common: true },
            ]);
            siteMonitor.notify(mockChange);

            const expectedDiff = '```diff\n⚪ line 1\n🔴 line 2\n🟢 line three\n⚪ line 4\n```';
            const sentEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
            const diffField = sentEmbed.data.fields.find(f => f.name === '📝 Cambios detectados');
            expect(diffField.value).toBe(expectedDiff);
        });

        it('should truncate long diffs', () => {
            const longContent = 'a'.repeat(2000);
            diff.diffLines.mockReturnValue([
                { value: longContent, removed: true },
                { value: longContent, added: true },
            ]);
            
            siteMonitor.notify(mockChange);
            const sentEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
            const diffField = sentEmbed.data.fields.find(f => f.name === '📝 Cambios detectados');
            expect(diffField.value).toContain('... (truncado)');
            expect(diffField.value.length).toBeLessThanOrEqual(1024);
        });

        it('should log an error if notification channel not found', () => {
            // Mock get returning undefined
            jest.spyOn(client.channels.cache, 'get').mockReturnValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            siteMonitor.notify(mockChange);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Notification channel not found for site-monitor.'));
            expect(mockChannel.send).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
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
            diff.diffLines.mockReturnValue([]);
            siteMonitor.notify(mockChangeWithoutTitle);
            
            const sentEmbed = mockChannel.send.mock.calls[0][0].embeds[0];
            expect(sentEmbed.data.title).toBe('¡Cambio en fallback-site-id!  🐸');
        });
    });

    // New tests for fetchAndProcess method
    describe('fetchAndProcess method', () => {
        it('should fetch, clean, and hash content', async () => {
            const rawContent = '  content  \n';
            const html = `<html><body>${rawContent}</body></html>`;
            got.mockResolvedValue({ body: html });
            
            crypto._mockDigest.mockReturnValue('mock-hash-clean');

            const result = await siteMonitor.fetchAndProcess('http://example.com', 'body');

            expect(got).toHaveBeenCalledWith('http://example.com', expect.anything());
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
            crypto._mockDigest.mockReturnValue('mock-hash');

            const { site, warning } = await siteMonitor.addSite('http://new-site.com', 'body');

            expect(site.url).toBe('http://new-site.com');
            expect(site.lastContent).toBe('content');
            expect(site.hash).toBe('mock-hash');
            expect(warning).toBe(false);

            expect(siteMonitor.state).toHaveLength(2);
            expect(siteMonitor.state[1]).toBe(site);
            expect(storage.write).toHaveBeenCalledWith('sites.json', siteMonitor.state);
        });

        it('should return warning if selector not found', async () => {
            const html = `<html><body>content</body></html>`;
            got.mockResolvedValue({ body: html });
            
            // JSDOM mock logic: if selector not found, returns null.
            // Our manual mock for JSDOM in __mocks__/jsdom.js replicates this by using actual JSDOM
            // so it should work correctly if passed real HTML.

            const { site, warning } = await siteMonitor.addSite('http://new-site.com', '#non-existent');

            expect(warning).toBe(true);
            expect(site.css).toBe('#non-existent');
            expect(site.lastContent).toBe(''); 
        });

        it('should not add a duplicate site', async () => {
            const existingSite = siteMonitor.state[0];
            const { site } = await siteMonitor.addSite(existingSite.url, existingSite.css);

            expect(site).toBe(existingSite);
            expect(siteMonitor.state).toHaveLength(1);
            expect(storage.write).not.toHaveBeenCalled();
        });

        it('should throw error if fetch fails and force is false', async () => {
            got.mockRejectedValue(new Error('Fetch failed'));
            await expect(siteMonitor.addSite('http://error.com', 'body')).rejects.toThrow('Fetch failed');
        });

        it('should add site if fetch fails and force is true', async () => {
            got.mockRejectedValue(new Error('Fetch failed'));
            const { site, warning } = await siteMonitor.addSite('http://error.com', 'body', true);

            expect(site.url).toBe('http://error.com');
            expect(site.id).toBe('error.com');
            expect(site.lastContent).toBe('');
            expect(warning).toBe(false);
            expect(siteMonitor.state).toHaveLength(2);
        });
    });
});
