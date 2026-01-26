const Discord = require('discord.js');
const { handleCommand, commands } = require('./command-handler.js');
const storage = require('./storage.js');
const { CronJob } = require('cron');

//
// Mock external modules
//

// Mock cron to prevent actual cron jobs from running during tests
jest.mock('cron', () => ({
    CronJob: jest.fn(function(cronTime, onTick) {
        this.onTick = onTick; // Store the onTick function
        this.start = jest.fn();
        this.stop = jest.fn();
        this.setTime = jest.fn();
        this.running = true;
    }),
    CronTime: jest.fn(function(time) {
        this.time = time;
    }),
}));

// Mock storage to prevent file system operations
jest.mock('./storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    saveSettings: jest.fn(),
    loadResponses: jest.fn(),
}));

// Mock site-monitor to prevent actual site checks
jest.mock('./site-monitor', () => ({
    checkSites: jest.fn(),
}));

// Mock got and jsdom globally for commands.test.js
jest.mock('got', () => jest.fn());
jest.mock('jsdom', () => ({
    JSDOM: jest.fn(),
}));

// Mock crypto to prevent actual hashing
jest.mock('crypto', () => ({
    createHash: jest.fn(() => ({
        update: jest.fn(() => ({
            digest: jest.fn(() => 'mockedHash'),
        })),
    })),
}));

// Custom mock for Discord.js Client and MessageEmbed
jest.mock('discord.js', () => ({
    Client: jest.fn().mockImplementation(() => {
        const mockChannel = {
            send: jest.fn(),
            id: 'admin-channel'
        };
        return {
            channels: {
                cache: {
                    get: jest.fn(() => mockChannel),
                },
            },
            login: jest.fn(),
            on: jest.fn(),
            emit: jest.fn(),
        };
    }),
    MessageEmbed: jest.fn().mockImplementation(() => {
        const embed = {
            _title: '',
            _color: '',
            _fields: [],
            setTitle: jest.fn(function(title) { this._title = title; return this; }),
            setColor: jest.fn(function(color) { this._color = color; return this; }),
            addField: jest.fn(function(name, value, inline) {
                this._fields.push({ name, value, inline });
                return this;
            }),
        };
        return embed;
    }),
    Collection: jest.fn().mockImplementation(() => {
        const map = new Map();
        return {
            /**
             * Sets a key-value pair in the collection.
             * @param {*} key - The key.
             * @param {*} value - The value.
             * @returns {Map} The map object.
             */
            set: (key, value) => map.set(key, value),
            /**
             * Gets a value from the collection by key.
             * @param {*} key - The key.
             * @returns {*} The value.
             */
            get: (key) => map.get(key),
            /**
             * Finds a value in the collection.
             * @param {Function} fn - The function to use for finding the value.
             * @returns {*} The value.
             */
            find: (fn) => {
                for (const item of map.values()) {
                    if (fn(item)) {
                        return item;
                    }
                }
                return undefined;
            },
            /**
             * Returns an iterator for the values in the collection.
             * @returns {Iterator} The iterator.
             */
            values: () => map.values(),
        };
    }),
}));

//
// Test suite for Discord commands
//
/**
 * Test suite for Discord commands.
 */
describe('Discord Commands Test', () => {
    let mockMessage;
    let mockClient;
    let mockChannel;
    let mockMember;
    let mockState;
    let mockConfig;
    let mockCronUpdate;
    let mockCarrierCron;
    let mockAppleFeatureCron;
    let mockApplePayCron;
    let mockAppleEsimCron;

    /**
     * Set up environment variables before all tests.
     * @returns {void}
     */
    beforeAll(() => {
        process.env.DISCORDJS_ADMINCHANNEL_ID = 'admin-channel';
        process.env.DISCORDJS_ROLE_ID = 'admin-role';
    });

    /**
     * Set up mocks before each test.
     * @returns {void}
     */
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Discord client and channel
        mockClient = new Discord.Client(); 
        mockChannel = mockClient.channels.cache.get('admin-channel');

        // Mock message and member
        mockMember = {
            roles: {
                cache: {
                    has: jest.fn().mockReturnValue(true)
                }
            }
        };
        mockMessage = {
            content: '',
            author: { bot: false },
            channel: mockChannel,
            member: mockMember,
        };

        // Mock state and config
        mockState = {
            sitesToMonitor: [],
            settings: { interval: 5 },
            responses: [],
        };

        mockConfig = {
            DISCORDJS_APCHANNEL_ID: 'ap-channel',
            DISCORDJS_ADMINCHANNEL_ID: 'admin-channel',
            DISCORDJS_ROLE_ID: 'admin-role',
            interval: 5,
        };

        // Mock cron jobs
        mockCronUpdate = new CronJob('', () => {});
        mockCarrierCron = new CronJob('', () => {});
        mockAppleFeatureCron = new CronJob('', () => {});
        mockApplePayCron = new CronJob('', () => {});
        mockAppleEsimCron = new CronJob('', () => {});

        // Mock storage functions
        storage.loadSites.mockReturnValue(mockState.sitesToMonitor);
        storage.loadSettings.mockReturnValue(mockState.settings);
        storage.loadResponses.mockReturnValue(mockState.responses);

        // Mock got and jsdom
        require('got').mockResolvedValue({ body: '<html><head><title>Example</title></head><body>Hello</body></html>' });
        require('jsdom').JSDOM.mockImplementation(() => ({
            window: {
                document: {
                    querySelector: jest.fn((selector) => {
                        if (selector === 'head') return { textContent: '<html><head><title>Example</title></head><body>Hello</body></html>' };
                        return null;
                    }),
                    title: 'Example',
                },
            },
        }));
    });

    // Dynamically create a test for each command
    for (const command of commands.values()) {
        /**
         * Test suite for the !${command.name} command.
         */
        describe(`!${command.name} command`, () => {
            /**
             * Test case for executing the ${command.name} command.
             * @returns {void}
             */
            it(`should execute the ${command.name} command`, () => {
                const executeSpy = jest.spyOn(command, 'execute');
                mockMessage.content = `!${command.name}`;
                handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);
                expect(executeSpy).toHaveBeenCalledWith(mockMessage, [], mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);
            });
        });
    }
});