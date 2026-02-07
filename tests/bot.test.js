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

// Mock storage, got, jsdom, discord.js using shared mocks
jest.mock('../src/storage');
jest.mock('got');
jest.mock('jsdom');
jest.mock('discord.js');

// Mock fs
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockReturnValue(['SiteMonitor.js']),
    existsSync: jest.fn().mockImplementation((path) => !path.toString().endsWith('channels')),
    promises: {
        readdir: jest.fn().mockResolvedValue(['SiteMonitor.js']),
    },
}));

describe('Bot', () => {
    // Helper to get the ready callback
    function getReadyCallback() {
        const { client } = require('../src/bot.js');
        const call = client.on.mock.calls.find(call => call[0] === 'ready');
        return call ? call[1] : null;
    }

    // Helper to get the message callback
    function getMessageCallback() {
        const { client } = require('../src/bot.js');
        const call = client.on.mock.calls.find(call => call[0] === 'messageCreate');
        return call ? call[1] : null;
    }

    // Helper to get the interaction callback
    function getInteractionCallback() {
        const { client } = require('../src/bot.js');
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
            channels: []
        }));
        const bot = require('../src/bot.js');
        expect(bot.client).toBeDefined();
        expect(bot.client.on).toHaveBeenCalledWith('ready', expect.any(Function));
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
                    channels: []
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
                    channels: []
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