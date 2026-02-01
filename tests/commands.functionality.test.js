const intervalCommand = require('../src/commands/interval');
const monitorCommand = require('../src/commands/monitor');
const storage = require('../src/storage');

jest.mock('../src/storage', () => ({
    saveSettings: jest.fn(),
    loadSettings: jest.fn(),
}));

describe('Command Functionality', () => {
    let mockInteraction, mockMonitorManager, mockConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        mockInteraction = {
            options: {
                getInteger: jest.fn(),
                getString: jest.fn(),
                getSubcommand: jest.fn(),
                getFocused: jest.fn() // For autocomplete
            },
            reply: jest.fn(),
            respond: jest.fn() // For autocomplete
        };

        mockConfig = {
            interval: 5
        };

        mockMonitorManager = {
            setAllIntervals: jest.fn(),
            startAll: jest.fn(),
            getAllMonitors: jest.fn().mockReturnValue([]),
            getMonitor: jest.fn()
        };
    });

    describe('/interval', () => {
        it('should update interval', async () => {
            mockInteraction.options.getInteger.mockReturnValue(10);
            
            await intervalCommand.execute(mockInteraction, {}, {}, mockConfig, {}, mockMonitorManager);

            expect(mockConfig.interval).toBe(10);
            expect(storage.saveSettings).toHaveBeenCalledWith(mockConfig);
            expect(mockMonitorManager.setAllIntervals).toHaveBeenCalledWith(10);
            expect(mockMonitorManager.startAll).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith('Interval set to 10 minutes.');
        });
    });

    describe('/monitor', () => {
        beforeEach(() => {
            const mockMonitors = [
                { name: 'AppleEsim', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'AppleEsim', isRunning: true }) },
                { name: 'Carrier', start: jest.fn(), stop: jest.fn(), check: jest.fn(), getStatus: () => ({ name: 'Carrier', isRunning: false }) },
            ];
            mockMonitorManager.getAllMonitors.mockReturnValue(mockMonitors);
            mockMonitorManager.getMonitor.mockImplementation(name => mockMonitors.find(m => m.name === name));
        });

        it('should start all monitors', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('start');
            mockInteraction.options.getString.mockReturnValue('all');

            await monitorCommand.execute(mockInteraction, {}, {}, {}, {}, mockMonitorManager);

            expect(mockMonitorManager.getAllMonitors).toHaveBeenCalled();
            mockMonitorManager.getAllMonitors().forEach(m => expect(m.start).toHaveBeenCalled());
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('Started monitor(s)'));
        });

        it('should stop specific monitor', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('stop');
            mockInteraction.options.getString.mockReturnValue('AppleEsim');

            await monitorCommand.execute(mockInteraction, {}, {}, {}, {}, mockMonitorManager);

            const monitor = mockMonitorManager.getMonitor('AppleEsim');
            expect(monitor.stop).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.stringContaining('Stopped monitor(s): AppleEsim'));
        });
        
        it('should autocomplete monitor names', async () => {
             mockInteraction.options.getFocused.mockReturnValue('Apple');
             
             await monitorCommand.autocomplete(mockInteraction, mockMonitorManager);
             
             expect(mockInteraction.respond).toHaveBeenCalledWith([
                 { name: 'AppleEsim', value: 'AppleEsim' }
             ]);
        });
    });
});