const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const { handleCommand, commands } = require('./command-handler.js');
const storage = require('./storage.js');
const siteMonitor = require('./site-monitor.js');
const { CronJob, CronTime } = require('cron');

// Mock external modules
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

jest.mock('./storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    saveSettings: jest.fn(),
    loadResponses: jest.fn(),
}));

jest.mock('./site-monitor', () => ({
    checkSites: jest.fn(),
}));

// Mock got and jsdom globally for commands.test.js
jest.mock('got', () => jest.fn());
jest.mock('jsdom', () => ({
    JSDOM: jest.fn(),
}));
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
    }),
}));


describe('Discord Commands Test', () => {
    let mockMessage;
    let mockClient;
    let mockChannel;
    let mockMember;
    let mockState;
    let mockConfig;

    beforeAll(() => {
        process.env.DISCORDJS_ADMINCHANNEL_ID = 'admin-channel';
        process.env.DISCORDJS_ROLE_ID = 'admin-role';
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockClient = new Discord.Client(); 
        mockChannel = mockClient.channels.cache.get('admin-channel');

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
        mockCronUpdate = new CronJob('', () => {});
        mockCarrierCron = new CronJob('', () => {});
        mockAppleFeatureCron = new CronJob('', () => {});
        mockApplePayCron = new CronJob('', () => {});
        mockAppleEsimCron = new CronJob('', () => {});

        storage.loadSites.mockReturnValue(mockState.sitesToMonitor);
        storage.loadSettings.mockReturnValue(mockState.settings);
        storage.loadResponses.mockReturnValue(mockState.responses);

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

    for (const command of commands.values()) {
        describe(`!${command.name} command`, () => {
            it(`should execute the ${command.name} command`, () => {
                const executeSpy = jest.spyOn(command, 'execute');
                mockMessage.content = `!${command.name}`;
                handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);
                expect(executeSpy).toHaveBeenCalledWith(mockMessage, [], mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);
            });
        });
    }
});