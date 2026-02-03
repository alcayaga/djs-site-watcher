
const SiteMonitor = require('../src/monitors/SiteMonitor');
const Discord = require('discord.js');
const got = require('got');
const storage = require('../src/storage');
const crypto = require('crypto');

// Mocks
jest.mock('../src/storage', () => ({
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

jest.mock('got');

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

describe('SiteMonitor Migration and ID Update', () => {
    let client;
    let siteMonitor;
    let mockChannelSend;

    beforeEach(() => {
        jest.clearAllMocks();
        mockChannelSend = jest.fn();
        const mockChannel = { send: mockChannelSend };

        jest.spyOn(Discord, 'Client').mockImplementation(() => ({
            channels: {
                cache: {
                    get: jest.fn(() => mockChannel),
                },
            },
        }));

        jest.spyOn(Discord, 'EmbedBuilder').mockImplementation(() => ({
             setTitle: jest.fn().mockReturnThis(),
             addFields: jest.fn().mockReturnThis(),
             setColor: jest.fn().mockReturnThis(),
        }));

        client = new Discord.Client();
        const monitorConfig = { file: 'sites.json' };
        siteMonitor = new SiteMonitor('site-monitor', monitorConfig);
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
        crypto.createHash().digest.mockReturnValue('mock-hash'); 

        await siteMonitor.check(client);

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
        crypto.createHash().digest.mockReturnValue('mock-hash');

        await siteMonitor.check(client);

        expect(siteMonitor.state[0].id).toBe('example.com');
    });
});
