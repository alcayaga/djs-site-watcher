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
    this.check = jest.fn();
    this.saveState = jest.fn().mockResolvedValue(undefined);
    this.state = [];
    this.initialize = jest.fn().mockResolvedValue(this);
});

// Mock config
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

const _Discord = require('discord.js');
const _storage = require('../src/storage.js');
const _got = require('got');
const _JSDOM = require('jsdom');
const _state = require('../src/state');
const _MonitorManager = require('../src/MonitorManager');
const _commandHandler = require('../src/command-handler'); // Import mocked command handler

// Mock MonitorManager
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

// Mock storage
jest.mock('../src/storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    loadResponses: jest.fn().mockReturnValue([]),
    read: jest.fn().mockResolvedValue({}),
    write: jest.fn().mockResolvedValue(true),
    migrateLegacyData: jest.fn(),
}));

// Mock got
jest.mock('got', () => jest.fn(() => Promise.resolve({ body: '<html><body>Generic Mock HTML</body></html>' })));

// Mock jsdom
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

// Mock command-handler
jest.mock('../src/command-handler', () => ({
    handleCommand: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue(['SiteMonitor.js']), // Return a real monitor file name that exists in src/monitors
}));

// Mock discord.js
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
    
    // Create a mock client that we can control
    const on = jest.fn();
    const login = jest.fn();
    const client = {
        channels: {
            cache: {
                get: jest.fn(() => ({
                    send: jest.fn().mockResolvedValue(true),
                })),
            },
        },
        on,
        login,
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
    // Helper to get the ready callback
    function getReadyCallback() {
        const client = new (require('discord.js').Client)();
        // find call to 'ready'
        const call = client.on.mock.calls.find(call => call[0] === 'ready');
        return call ? call[1] : null;
    }

    // Helper to get the message callback
    function getMessageCallback() {
        const client = new (require('discord.js').Client)();
        const call = client.on.mock.calls.find(call => call[0] === 'message');
        return call ? call[1] : null;
    }

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Re-setup default config mock
        jest.mock('../src/config', () => ({
            interval: 5,
            monitors: [],
            DISCORDJS_BOT_TOKEN: 'mock_token',
            SINGLE_RUN: 'true',
        }));

        const storage = require('../src/storage.js');
        storage.loadSites.mockReturnValue([]);
        storage.loadResponses.mockReturnValue([]);
        storage.loadSettings.mockImplementation(() => ({
            interval: 5,
            monitors: [],
        }));
    });

    it('should initialize client and registers event handlers', () => {
        const bot = require('../src/bot.js');
        expect(bot.client).toBeDefined();
        expect(bot.client.on).toHaveBeenCalledWith('ready', expect.any(Function));
        expect(bot.client.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should initialize monitors and run checkAll on ready in SINGLE_RUN mode', async () => {
        require('../src/bot.js');
        const readyCallback = getReadyCallback();
        expect(readyCallback).toBeDefined();

        await readyCallback();

        const monitorManager = require('../src/MonitorManager');
        expect(monitorManager.initialize).toHaveBeenCalled();
        expect(monitorManager.checkAll).toHaveBeenCalled();
        expect(monitorManager.startAll).not.toHaveBeenCalled(); // Should not start cron in single run
    });

    it('should initialize monitors and startAll on ready in normal mode', async () => {
        // Override config for this test
        jest.resetModules();
        jest.mock('../src/config', () => ({
            interval: 10,
            monitors: [],
            DISCORDJS_BOT_TOKEN: 'mock_token',
            SINGLE_RUN: 'false',
        }));
        
        // Need to re-require everything since modules were reset
        require('../src/bot.js');
        const readyCallback = getReadyCallback();
        
        await readyCallback();

        const monitorManager = require('../src/MonitorManager');
        expect(monitorManager.initialize).toHaveBeenCalled();
        expect(monitorManager.setAllIntervals).toHaveBeenCalledWith(10);
        expect(monitorManager.startAll).toHaveBeenCalled();
        expect(monitorManager.checkAll).not.toHaveBeenCalled();
    });

    it('should handle incoming messages via commandHandler', () => {
        require('../src/bot.js');
        const messageCallback = getMessageCallback();
        expect(messageCallback).toBeDefined();

        const mockMessage = { content: '!ping' };
        messageCallback(mockMessage);

        const commandHandler = require('../src/command-handler');
        expect(commandHandler.handleCommand).toHaveBeenCalledWith(
            mockMessage,
            expect.anything(), // client
            expect.anything(), // state
            expect.anything(), // config
            null, // cronUpdate
            expect.anything() // monitorManager
        );
    });
});