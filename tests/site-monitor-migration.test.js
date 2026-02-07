const SiteMonitor = require('../src/monitors/SiteMonitor');
const Discord = require('discord.js');
const got = require('got');
const storage = require('../src/storage');
const crypto = require('crypto');

// Use manual mocks
jest.mock('discord.js');
jest.mock('got');
jest.mock('jsdom');
jest.mock('crypto');
jest.mock('diff');
jest.mock('../src/storage');
jest.mock('../src/config');

describe('SiteMonitor Migration and ID Update', () => {
    let client;
    let siteMonitor;

    beforeEach(() => {
        jest.clearAllMocks();
        
        client = new Discord.Client();
        // mockChannel = client.channels.cache.get('mockChannelId'); // Unused

        storage.read.mockClear();
        storage.write.mockClear();

        const monitorConfig = { file: 'sites.json' };
        siteMonitor = new SiteMonitor('site-monitor', monitorConfig);
        siteMonitor.client = client;
    });

    it('addSite should use page title as ID', async () => {
        const html = '<html><head><title>My Awesome Site</title></head><body>Content</body></html>';
        got.mockResolvedValue({ body: html });

        const { site } = await siteMonitor.addSite('http://example.com', 'body');

        expect(site.id).toBe('My Awesome Site');
        expect(site.url).toBe('http://example.com');
    });

    it('addSite should fallback to hostname if title is missing', async () => {
        const html = '<html><head></head><body>Content</body></html>';
        got.mockResolvedValue({ body: html });

        const { site } = await siteMonitor.addSite('http://example.com', 'body');

        expect(site.id).toBe('example.com');
    });

    it('check should migrate existing site ID to title', async () => {
        const legacySite = {
            id: 'example.com',
            url: 'http://example.com',
            css: 'body',
            lastChecked: 0,
            lastUpdated: 0,
            hash: 'mock-hash',
            lastContent: 'Content'
        };
        siteMonitor.state = [legacySite];

        const html = '<html><head><title>Updated Title</title></head><body>Content</body></html>';
        got.mockResolvedValue({ body: html });
        // Same content hash to avoid notification trigger logic
        crypto._mockDigest.mockReturnValue('mock-hash'); 

        await siteMonitor.check();

        expect(siteMonitor.state[0].id).toBe('Updated Title');
        expect(storage.write).toHaveBeenCalledWith('sites.json', siteMonitor.state);
    });
    
    it('check should NOT migrate ID if title is empty', async () => {
        const legacySite = {
            id: 'example.com',
            url: 'http://example.com',
            css: 'body',
            lastChecked: 0,
            lastUpdated: 0,
            hash: 'mock-hash',
            lastContent: 'Content'
        };
        siteMonitor.state = [legacySite];

        const html = '<html><head></head><body>Content</body></html>';
        got.mockResolvedValue({ body: html });
        crypto._mockDigest.mockReturnValue('mock-hash');

        await siteMonitor.check();

        expect(siteMonitor.state[0].id).toBe('example.com');
    });
});