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

const _Discord = require('discord.js');
const _storage = require('../src/storage.js');
const _got = require('got');
const _JSDOM = require('jsdom');
const _state = require('../src/state');
const _MonitorManager = require('../src/MonitorManager');

// Mock handlers
jest.mock('../src/handlers/interactionHandler', () => ({
    handleInteraction: jest.fn(),
}));
jest.mock('../src/handlers/messageHandler', () => ({
    handleMessage: jest.fn(),
}));

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

// Mock fs
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue(['SiteMonitor.js']),
}));

// Mock discord.js
jest.mock('discord.js', () => {
    const originalDiscord = jest.requireActual('discord.js');
    const EmbedBuilder = jest.fn(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis(),
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
            map: (fn) => Array.from(map.values()).map(fn),
        };
    });
    
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
        },
        application: {
            commands: {
                set: jest.fn().mockResolvedValue([])
            }
        }
    };

    return {
        ...originalDiscord,
        Client: jest.fn(() => client),
        EmbedBuilder,
        Collection,
        GatewayIntentBits: {
            Guilds: 1,
            GuildMessages: 512,
            MessageContent: 32768
        },
        Partials: {
            Channel: 1
        },
        Events: {
            ClientReady: 'clientReady',
            InteractionCreate: 'interactionCreate',
            MessageCreate: 'messageCreate'
        }
    };
});

describe('Bot', () => {
    // Helper to get the ready callback
    function getReadyCallback() {
        const client = new (require('discord.js').Client)();
        const call = client.on.mock.calls.find(call => call[0] === 'clientReady');
        return call ? call[1] : null;
    }

    // Helper to get the message callback
    function getMessageCallback() {
        const client = new (require('discord.js').Client)();
        const call = client.on.mock.calls.find(call => call[0] === 'messageCreate');
        return call ? call[1] : null;
    }

    // Helper to get the interaction callback
    function getInteractionCallback() {
        const client = new (require('discord.js').Client)();
        const call = client.on.mock.calls.find(call => call[0] === 'interactionCreate');
        return call ? call[1] : null;
    }

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        const storage = require('../src/storage.js');
        storage.loadSites.mockReturnValue([]);
        storage.loadResponses.mockReturnValue([]);
        storage.loadSettings.mockImplementation(() => ({
            interval: 5,
            monitors: [],
        }));
    });

    it('should initialize client and registers event handlers', () => {
        jest.doMock('../src/config', () => ({
            DISCORDJS_BOT_TOKEN: 'mock_token',
        }));
        const bot = require('../src/bot.js');
        expect(bot.client).toBeDefined();
        expect(bot.client.on).toHaveBeenCalledWith('clientReady', expect.any(Function));
        expect(bot.client.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
        expect(bot.client.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    });

    describe('on "ready" event', () => {
        describe('in SINGLE_RUN mode', () => {
            beforeEach(() => {
                jest.doMock('../src/config', () => ({
                    interval: 5,
                    monitors: [],
                    DISCORDJS_BOT_TOKEN: 'mock_token',
                    SINGLE_RUN: 'true',
                }));
            });

            it('should initialize monitors and run checkAll', async () => {
                require('../src/bot.js');
                const readyCallback = getReadyCallback();
                expect(readyCallback).toBeDefined();

                await readyCallback();

                const monitorManager = require('../src/MonitorManager');
                expect(monitorManager.initialize).toHaveBeenCalled();
                expect(monitorManager.checkAll).toHaveBeenCalled();
                expect(monitorManager.startAll).not.toHaveBeenCalled();
            });
        });

        describe('in normal mode', () => {
            beforeEach(() => {
                jest.doMock('../src/config', () => ({
                    interval: 10,
                    monitors: [],
                    DISCORDJS_BOT_TOKEN: 'mock_token',
                    SINGLE_RUN: 'false',
                }));
            });

            it('should initialize monitors and start them', async () => {
                require('../src/bot.js');
                const readyCallback = getReadyCallback();
                expect(readyCallback).toBeDefined();

                await readyCallback();

                // It should NOT call client.application.commands.set anymore (removed in bot.js)
                // const bot = require('../src/bot.js');
                // expect(bot.client.application.commands.set).toHaveBeenCalled(); // Removed

                const monitorManager = require('../src/MonitorManager');
                expect(monitorManager.initialize).toHaveBeenCalled();
                expect(monitorManager.setAllIntervals).toHaveBeenCalledWith(10);
                expect(monitorManager.startAll).toHaveBeenCalled();
            });
        });
    });

    it('should handle incoming messages via messageHandler.handleMessage', () => {
        jest.doMock('../src/config', () => ({
            DISCORDJS_BOT_TOKEN: 'mock_token',
        }));
        require('../src/bot.js');
        const messageCallback = getMessageCallback();
        expect(messageCallback).toBeDefined();

        const mockMessage = { content: 'test' };
        messageCallback(mockMessage);

        const messageHandler = require('../src/handlers/messageHandler');
        expect(messageHandler.handleMessage).toHaveBeenCalledWith(
            mockMessage,
            expect.anything(), // state
            expect.anything(), // config
        );
    });

    it('should handle incoming interactions via interactionHandler.handleInteraction', async () => {
        jest.doMock('../src/config', () => ({
            DISCORDJS_BOT_TOKEN: 'mock_token',
        }));
        require('../src/bot.js');
        const interactionCallback = getInteractionCallback();
        expect(interactionCallback).toBeDefined();

        const mockInteraction = { isChatInputCommand: () => true };
        await interactionCallback(mockInteraction);

        const interactionHandler = require('../src/handlers/interactionHandler');
        expect(interactionHandler.handleInteraction).toHaveBeenCalledWith(
            mockInteraction,
            expect.anything(), // client
            expect.anything(), // state
            expect.anything(), // config
            expect.anything() // monitorManager
        );
    });
});