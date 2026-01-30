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

const SiteMonitor = require('../src/monitors/SiteMonitor');
const Discord = require('discord.js');
const got = require('got');
const { JSDOM } = require('jsdom');
const storage = require('../src/storage');
const crypto = require('crypto');
const diff = require('diff');

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

describe('SiteMonitor Context & Clean Features', () => {
    let client;
    let siteMonitor;
    let mockChannel;
    let mockMessageEmbedInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        mockChannel = { send: jest.fn() };
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

        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mockChannelId';
        client = new Discord.Client();
        
        siteMonitor = new SiteMonitor('site-monitor', { file: 'sites.json' });
        siteMonitor.client = client;
        siteMonitor.state = [
            {
                id: 'test-site.com',
                url: 'http://test-site.com',
                css: 'body',
                lastChecked: 0,
                lastUpdated: 0,
                hash: 'old-hash',
                lastContent: 'clean\ncontent', 
            },
        ];
    });

    it('should ignore changes that are only whitespace/empty lines (CleanText)', async () => {
        const rawResponse = 'clean\n   \ncontent\n';
        const html = `<html><body>${rawResponse}</body></html>`;
        got.mockResolvedValue({ body: html });
        
        // Removed JSDOM.mockImplementation

        const updateSpy = crypto.createHash().update;
        
        await siteMonitor.check(client);
        
        expect(updateSpy).toHaveBeenCalledWith('clean\ncontent'); 
    });

    it('should silently update state (migration) if only whitespace changed vs stored content', async () => {
        siteMonitor.state[0].lastContent = '  clean  \n  content  ';
        siteMonitor.state[0].hash = 'hash-of-dirty-content';
        
        const newRawResponse = 'clean\ncontent';
        const html = `<html><body>${newRawResponse}</body></html>`;
        got.mockResolvedValue({ body: html });
        
        const mockDigest = jest.fn();
        mockDigest
            .mockReturnValueOnce('hash-of-clean-content') 
            .mockReturnValue('hash-of-clean-content');
            
        crypto.createHash.mockImplementation(() => ({
            update: jest.fn().mockReturnThis(),
            digest: mockDigest
        }));

        const notifySpy = jest.spyOn(siteMonitor, 'notify');
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await siteMonitor.check(client);
        
        expect(storage.write).toHaveBeenCalled();
        expect(notifySpy).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[Migration] Updated'));
    });

    it('should format diffs with limited context and emoji spacing', () => {
        const mockChange = {
            site: { url: 'http://example.com', lastUpdated: 'now' },
            oldContent: '...',
            newContent: '...',
            dom: { window: { document: { title: 'Title' } } },
        };
        
        const lines = [
            { value: '1\n2\n3\n4\n5\n', count: 5, added: undefined, removed: undefined },
            { value: '6\n', count: 1, removed: true },
            { value: 'six\n', count: 1, added: true },
            { value: '7\n8\n9\n10\n11\n', count: 5, added: undefined, removed: undefined }
        ];
        diff.diffLines.mockReturnValue(lines);

        siteMonitor.notify(mockChange);
        
        const sentMessage = mockChannel.send.mock.calls[1][0];
        
        expect(sentMessage).toContain('🔴 6');
        expect(sentMessage).toContain('🟢 six');
        expect(sentMessage).toContain('⚪ 3');
        expect(sentMessage).not.toContain('⚪ 1'); 
        expect(sentMessage).toContain('⚪ 3');     
    });
    
    it('should use "..." for gaps in context', () => {
        const mockChange = {
            site: { url: 'http://example.com', lastUpdated: 'now' },
            oldContent: '...',
            newContent: '...',
            dom: { window: { document: { title: 'Title' } } },
        };

        const lines = [
            { value: '1\n2\n3\n4\n', count: 4 }, 
            { value: '5\n', removed: true },      
            { value: '6\n7\n8\n9\n10\n11\n12\n13\n14\n', count: 9 }, 
            { value: '15\n', added: true },       
        ];
        diff.diffLines.mockReturnValue(lines);
        
        siteMonitor.notify(mockChange);
        
        const sentMessage = mockChannel.send.mock.calls[1][0];
        expect(sentMessage).toContain('...'); 
        expect(sentMessage).toContain('⚪ 8');
        expect(sentMessage).not.toContain('⚪ 10'); 
        expect(sentMessage).toContain('⚪ 12');
    });
});