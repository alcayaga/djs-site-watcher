/* eslint-disable no-unused-vars */
const { handleCommand } = require('./command-handler');
const Discord = require('discord.js');
const storage = require('./storage');
const config = require('./config');
const MonitorManager = require('./MonitorManager');

// Mock discord.js with a manual mock for Collection
jest.mock('discord.js', () => {
    const originalDiscord = jest.requireActual('discord.js');
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
    return {
        ...originalDiscord,
        Collection,
    };
});
// Mock storage with loadSettings implementation
jest.mock('./storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn().mockReturnValue({ interval: 5, debug: false }), // Provide default mock implementation here
    saveSettings: jest.fn(),
    loadResponses: jest.fn(),
    saveResponses: jest.fn(),
}));
jest.mock('./config');
jest.mock('./MonitorManager', () => ({
    initialize: jest.fn(),
    startAll: jest.fn(),
    stopAll: jest.fn(),
    setAllIntervals: jest.fn(),
    getStatusAll: jest.fn(),
    checkAll: jest.fn(),
    getMonitor: jest.fn(),
    getAllMonitors: jest.fn(),
}));

describe('Discord Commands Functionality Test', () => {
    let mockClient, mockChannel, mockMessage, mockState, mockConfig, mockCronUpdate, mockMonitorManager;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Re-require mocked modules to get fresh mocks for each test
        const storageMock = require('./storage');
        const configMock = require('./config');
        mockMonitorManager = require('./MonitorManager'); // This is now the mocked instance

        mockChannel = {
            id: 'mockAdminChannelId',
            send: jest.fn().mockResolvedValue(true),
            startTyping: jest.fn(),
            stopTyping: jest.fn(),
        };

        mockClient = {
            channels: {
                cache: {
                    get: jest.fn(() => mockChannel),
                },
            },
        };

        mockMessage = {
            channel: mockChannel,
            author: { bot: false },
            member: {
                roles: {
                    cache: {
                        has: jest.fn(() => true),
                    },
                },
            },
            reply: jest.fn(),
        };

        mockState = {
            sitesToMonitor: [],
            responses: [],
        };

        mockConfig = {
            DISCORDJS_ADMINCHANNEL_ID: 'mockAdminChannelId',
            DISCORDJS_ROLE_ID: 'mockRoleId',
            PREFIX: '!',
            interval: 5,
        };

        mockCronUpdate = {
            start: jest.fn(),
            stop: jest.fn(),
            setTime: jest.fn(),
            running: true,
        };

        // Configure mocks for specific test needs
        storageMock.loadSettings.mockReturnValue(mockConfig);
    });

    describe('!interval command', () => {
        it('should update the monitoring interval', async () => {
            mockMessage.content = '!interval 10';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.setAllIntervals).toHaveBeenCalledWith(10);
            expect(mockChannel.send).toHaveBeenCalledWith('Interval set to 10 minutes.');
        });
    });

    describe('!monitor command', () => {
        let mockMonitors;
        beforeEach(() => {
            // Setup mock monitors for MonitorManager to cover all types
            mockMonitors = [
                { name: 'AppleEsim', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'AppleEsim', isRunning: true }) },
                { name: 'Carrier', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'Carrier', isRunning: false }) },
                { name: 'ApplePay', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'ApplePay', isRunning: true }) },
                { name: 'AppleFeature', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'AppleFeature', isRunning: false }) },
            ];
            mockMonitorManager.getAllMonitors.mockReturnValue(mockMonitors);
            mockMonitorManager.getMonitor.mockImplementation(name => mockMonitors.find(m => m.name.toLowerCase() === name.toLowerCase()));
        });

        it('should start all monitors with `!monitor start all`', async () => {
            mockMessage.content = '!monitor start all';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getAllMonitors).toHaveBeenCalled();
            mockMonitors.forEach(monitor => expect(monitor.start).toHaveBeenCalled()); // Check all mocked monitors
            expect(mockChannel.send).toHaveBeenCalledWith('Started monitor(s): AppleEsim, Carrier, ApplePay, AppleFeature.');
        });
        
        it('should stop a specific monitor with `!monitor stop AppleEsim`', async () => {
            mockMessage.content = '!monitor stop AppleEsim';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('AppleEsim');
            expect(mockMonitorManager.getMonitor('AppleEsim').stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Stopped monitor(s): AppleEsim.');
        });

        it('should get the status of all monitors with `!monitor status`', async () => {
            mockMessage.content = '!monitor status';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockChannel.send).toHaveBeenCalledWith('Monitor Status:\nAppleEsim: Running 🟢\nCarrier: Stopped 🔴\nApplePay: Running 🟢\nAppleFeature: Stopped 🔴');
        });

        it('should trigger a check for a specific monitor with `!monitor check Carrier`', async () => {
            mockMessage.content = '!monitor check Carrier';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor('Carrier').check).toHaveBeenCalledWith(mockClient);
            expect(mockChannel.send).toHaveBeenCalledWith('Triggering check for monitor(s): Carrier.');
        });

        // New tests for ApplePay and AppleFeature from old commands.test.js
        it('should start ApplePay monitor with `!monitor start ApplePay`', async () => {
            mockMessage.content = '!monitor start ApplePay';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('ApplePay');
            expect(mockMonitorManager.getMonitor('ApplePay').start).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Started monitor(s): ApplePay.');
        });

        it('should stop AppleFeature monitor with `!monitor stop AppleFeature`', async () => {
            mockMessage.content = '!monitor stop AppleFeature';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('AppleFeature');
            expect(mockMonitorManager.getMonitor('AppleFeature').stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Stopped monitor(s): AppleFeature.');
        });

        it('should get ApplePay monitor status with `!monitor status ApplePay`', async () => {
            mockMessage.content = '!monitor status ApplePay';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('ApplePay');
            expect(mockChannel.send).toHaveBeenCalledWith('Monitor Status:\nApplePay: Running 🟢');
        });

        it('should trigger a check for AppleFeature monitor with `!monitor check AppleFeature`', async () => {
            mockMessage.content = '!monitor check AppleFeature';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor).toHaveBeenCalledWith('AppleFeature');
            expect(mockMonitorManager.getMonitor('AppleFeature').check).toHaveBeenCalledWith(mockClient);
            expect(mockChannel.send).toHaveBeenCalledWith('Triggering check for monitor(s): AppleFeature.');
        });
    });
});
