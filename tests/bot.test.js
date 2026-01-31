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

const _MockMonitorClass = jest.fn().mockImplementation(function(name, monitorConfig) {
    this.name = name;
    this.monitorConfig = monitorConfig;
    this.check = jest.fn(); // Revert to simple jest.fn()
    this.saveState = jest.fn().mockResolvedValue(undefined); // Mock saveState method
    this.state = []; // Default state, will be overwritten by initialize
    this.initialize = jest.fn().mockResolvedValue(this); // Revert to simple mock implementation
});

// Mock config first, as it's a deep dependency
jest.mock('../src/config', () => ({
    interval: 5,
    monitors: [
        { name: 'AppleEsim', enabled: true, url: 'http://apple.com/esim', file: './config/apple_esim.json', country: 'Chile' },
        { name: 'Site', enabled: true, file: './config/sites.json' },
    ],
    DISCORDJS_BOT_TOKEN: 'mock_token',
    DISCORDJS_TEXTCHANNEL_ID: 'mock_text_channel_id',
    DISCORDJS_ADMINCHANNEL_ID: 'mock_admin_channel_id',
    DISCORDJS_ROLE_ID: 'mock_role_id',
    SINGLE_RUN: 'true',
    PREFIX: '!',
}));

const _Discord = require('discord.js'); // Keep Discord as it's used
const _storage = require('../src/storage.js');
const _got = require('got');
const _JSDOM = require('jsdom');
const _state = require('../src/state');
const _MonitorManager = require('../src/MonitorManager'); // Keep MonitorManager as it's used

// Fully mock MonitorManager
jest.mock('../src/MonitorManager', () => ({
    initialize: jest.fn(),
    startAll: jest.fn(),
    stopAll: jest.fn(),
    setAllIntervals: jest.fn(),
    getStatusAll: jest.fn(),
    checkAll: jest.fn(),
    getMonitor: jest.fn(),
    getAllMonitors: jest.fn(),
}));


jest.mock('../src/storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    loadResponses: jest.fn().mockReturnValue([]),
    read: jest.fn().mockResolvedValue({}),
    write: jest.fn().mockResolvedValue(true),
    migrateLegacyData: jest.fn(),
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
    // let monitorManager; // No longer directly referencing the mocked MonitorManager

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Re-introduce const storage = require('../src/storage.js'); in beforeEach for mocking
        const storage = require('../src/storage.js');
        storage.loadSites.mockReturnValue([]);
        storage.loadResponses.mockReturnValue([]);
        storage.loadSettings.mockImplementation(() => ({
            interval: 5,
            monitors: [],
        }));

        require('../src/bot.js');
    });

    describe('initialization', () => {
        it('should initialize correctly', () => {
            const bot = require('../src/bot.js');
            expect(bot.client).toBeDefined();
        });
    });
});
