jest.mock('cron', () => ({
    CronJob: jest.fn(function(cronTime, onTick) {
        this.onTick = onTick;
        this.start = jest.fn();
        this.stop = jest.fn();
        this.setTime = jest.fn();
        this.running = true;
    }),
    CronTime: jest.fn(function(time) {
        this.time = time;
    }),
}));

// Mock config first, as it's a deep dependency
jest.mock('./config', () => ({
    interval: 5,
    monitors: [
        { name: 'AppleEsim', enabled: true, url: 'http://apple.com/esim', file: './src/apple_esim.json', country: 'Chile' },
    ],
    DISCORDJS_BOT_TOKEN: 'mock_token',
    DISCORDJS_TEXTCHANNEL_ID: 'mock_text_channel_id',
    DISCORDJS_ADMINCHANNEL_ID: 'mock_admin_channel_id',
    DISCORDJS_ROLE_ID: 'mock_role_id',
    SINGLE_RUN: 'false',
    PREFIX: '!',
}));

const Discord = require('discord.js');
const storage = require('./storage.js');
const got = require('got');
const { JSDOM } = require('jsdom');

jest.mock('./storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    loadResponses: jest.fn(),
    read: jest.fn().mockResolvedValue({}),
    write: jest.fn().mockResolvedValue(true),
}));

jest.mock('got', () => jest.fn(() => Promise.resolve({ body: '<html><body>Generic Mock HTML</body></html>' })));

jest.mock('jsdom', () => ({
    JSDOM: jest.fn(() => ({
        window: {
            document: {
                querySelector: jest.fn(() => null),
                querySelectorAll: jest.fn(() => []),
            },
        },
    })),
}));

jest.mock('discord.js', () => {
    const originalDiscord = jest.requireActual('discord.js');
    const MessageEmbed = jest.fn(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        addField: jest.fn().mockReturnThis(),
    }));

    const Collection = jest.fn(() => {
        const map = new Map();
        return {
            set: (key, value) => map.set(key, value),
            get: (key) => map.get(key),
            find: (fn) => {
                for (const item of map.values()) {
                    if (fn(item)) {
                        return item;
                    }
                }
                return undefined;
            },
            values: () => map.values(),
        };
    });
    
    const on = jest.fn();
    const client = {
        channels: {
            cache: {
                get: jest.fn(() => ({
                    send: jest.fn().mockResolvedValue(true),
                })),
            },
        },
        on,
        emit: jest.fn(),
        user: {
            tag: 'test-bot'
        }
    };

    return {
        ...originalDiscord,
        Client: jest.fn(() => client),
        MessageEmbed,
        Collection,
    };
});

describe('Bot', () => {
    let client;

    beforeEach(() => {
        jest.resetModules(); // Reset modules to re-import bot.js
        jest.clearAllMocks();

        // Reload mocks before requiring bot.js
        storage.loadSites.mockReturnValue([]);
        storage.loadResponses.mockReturnValue([]);
        storage.loadSettings.mockImplementation(() => ({
            interval: 5,
            monitors: [],
        }));

        const bot = require('./bot.js'); // Require bot inside beforeEach
        client = new Discord.Client();
    });

    describe('initialization', () => {
        it('should fetch and set lastContent for sites that are missing it', async () => {
            const sitesWithoutLastContent = [{
                id: 'example.com',
                url: 'http://example.com',
                css: 'h1',
                lastChecked: 'never',
                lastUpdated: 'never'
            }];
            storage.loadSites.mockReturnValue(sitesWithoutLastContent);

            const mockHtml = '<html><head><title>Example</title></head><body><h1>Hello</h1></body></html>';
            got.mockResolvedValueOnce({ body: mockHtml });

            const dom = {
                window: {
                    document: {
                        querySelector: jest.fn((selector) => {
                            if (selector === 'h1') return { textContent: 'Hello' };
                            if (selector === 'head') return { textContent: '' };
                            return null;
                        }),
                        querySelectorAll: jest.fn(() => []),
                    },
                },
            };
            JSDOM.mockImplementationOnce(() => dom);

            const readyCallback = client.on.mock.calls.find(call => call[0] === 'ready')[1];
            await readyCallback();

            expect(got).toHaveBeenCalledWith('http://example.com');
            expect(storage.saveSites).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'example.com',
                        lastContent: 'Hello',
                    }),
                ])
            );
        });
    });
});