


// Mock cron
jest.mock('cron', () => ({
    CronJob: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        setTime: jest.fn(),
        running: true,
    })),
    CronTime: jest.fn(),
}));

// Mock fs-extra and got
jest.mock('fs-extra', () => ({
    readJSONSync: jest.fn().mockReturnValue({}),
    outputJSON: jest.fn(),
}));
jest.mock('got', () => jest.fn());

// Mock discord.js
jest.mock('discord.js', () => ({
    Client: jest.fn(() => {
        const listeners = {};
        const mockClientInstance = {
            on: jest.fn((event, callback) => {
                if (!listeners[event]) {
                    listeners[event] = [];
                }
                listeners[event].push(callback);
            }),
            emit: jest.fn((event, ...args) => {
                if (listeners[event]) {
                    listeners[event].forEach(callback => callback(...args));
                }
            }),
            listeners: jest.fn((event) => listeners[event] || []),
            channels: {
                cache: {
                    get: jest.fn(() => ({
                        send: jest.fn(),
                        id: 'admin-channel' // Ensure this matches DISCORDJS_ADMINCHANNEL_ID
                    })),
                },
            },
            login: jest.fn(),
        };
        return mockClientInstance;
    }),
    MessageEmbed: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        addField: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
    })),
}));

describe('Simplified Discord Commands Test', () => {
    let message;
    let monitorModule;

    beforeAll(() => {
        // Load the monitor module AFTER all mocks are defined
        monitorModule = require('./monitor.js');
        
        process.env.DISCORDJS_ADMINCHANNEL_ID = 'admin-channel';
        process.env.DISCORDJS_ROLE_ID = 'admin-role';
    });

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        const mockChannel = {
            send: jest.fn(),
            id: 'admin-channel'
        };
        const mockMember = {
            roles: {
                cache: {
                    has: jest.fn().mockReturnValue(true)
                }
            }
        };

        // Create a mock message object
        message = {
            content: '',
            author: { bot: false },
            channel: mockChannel,
            member: mockMember,
        };
    });

    describe('!applepay command', () => {
        it('should handle !applepay status', () => {
            message.content = '!applepay status';
            monitorModule.client.emit('message', message);
            expect(message.channel.send).toHaveBeenCalledWith('Apple Pay monitor is running.');
        });

        it('should handle !applepay start', () => {
            message.content = '!applepay start';
            monitorModule.client.emit('message', message);
            expect(message.channel.send).toHaveBeenCalledWith('Apple Pay monitor started.');
        });

        it('should handle !applepay stop', () => {
            message.content = '!applepay stop';
            monitorModule.client.emit('message', message);
            expect(message.channel.send).toHaveBeenCalledWith('Apple Pay monitor stopped.');
        });
    });

    describe('!applefeature command', () => {
        it('should handle !applefeature status', () => {
            message.content = '!applefeature status';
            monitorModule.client.emit('message', message);
            expect(message.channel.send).toHaveBeenCalledWith('Apple Feature monitor is running.');
        });

        it('should handle !applefeature start', () => {
            message.content = '!applefeature start';
            monitorModule.client.emit('message', message);
            expect(message.channel.send).toHaveBeenCalledWith('Apple Feature monitor started.');
        });

        it('should handle !applefeature stop', () => {
            message.content = '!applefeature stop';
            monitorModule.client.emit('message', message);
            expect(message.channel.send).toHaveBeenCalledWith('Apple Feature monitor stopped.');
        });
    });
});
