const { handleCommand } = require('../command-handler');
const Discord = require('discord.js');
const storage = require('../storage');
const config = require('../config');
const MonitorManager = require('../MonitorManager');

jest.mock('../storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    saveSettings: jest.fn(),
    loadResponses: jest.fn(),
    saveResponses: jest.fn(),
}));

jest.mock('../MonitorManager', () => ({
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
        
        mockChannel = {
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
            member: {
                roles: {
                    cache: new Map([['mockRoleId', true]]),
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

        // Mock the MonitorManager instance
        mockMonitorManager = MonitorManager;
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
        beforeEach(() => {
            // Setup mock monitors for MonitorManager
            const mockMonitors = [
                { name: 'AppleEsim', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'AppleEsim', isRunning: true }) },
                { name: 'Carrier', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'Carrier', isRunning: false }) },
            ];
            mockMonitorManager.getAllMonitors.mockReturnValue(mockMonitors);
            mockMonitorManager.getMonitor.mockImplementation(name => mockMonitors.find(m => m.name.toLowerCase() === name.toLowerCase()));
        });

        it('should start all monitors with `!monitor start all`', async () => {
            mockMessage.content = '!monitor start all';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getAllMonitors).toHaveBeenCalled();
            mockMonitorManager.getAllMonitors().forEach(monitor => expect(monitor.start).toHaveBeenCalled());
            expect(mockChannel.send).toHaveBeenCalledWith('Started monitor(s): AppleEsim, Carrier.');
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
            expect(mockChannel.send).toHaveBeenCalledWith('Monitor Status:\nAppleEsim: Running 🟢\nCarrier: Stopped 🔴');
        });

        it('should trigger a check for a specific monitor with `!monitor check Carrier`', async () => {
            mockMessage.content = '!monitor check Carrier';
            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockMonitorManager);
            expect(mockMonitorManager.getMonitor('Carrier').check).toHaveBeenCalledWith(mockClient);
            expect(mockChannel.send).toHaveBeenCalledWith('Triggering check for monitor(s): Carrier.');
        });
    });
});