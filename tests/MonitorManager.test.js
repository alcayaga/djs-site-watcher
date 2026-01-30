require('../src/MonitorManager');
require('../src/config');
const Discord = require('discord.js');

// Helper to create a mock Monitor class with necessary methods
/**
 * Creates a mock Monitor class with necessary methods for testing.
 * @param {string} className The name of the mock class.
 * @returns {jest.Mock} A mock Monitor class.
 */
const createMockMonitorClass = (className) => {
    /**
     * Mock Monitor constructor.
     * @param {string} name The name of the monitor.
     * @param {object} monitorConfig The configuration object for this monitor.
     */
    const MockMonitor = jest.fn(function(name, monitorConfig) {
        this.name = name;
        this.monitorConfig = monitorConfig;
        this.initialize = jest.fn().mockResolvedValue(this);
        this.start = jest.fn();
        this.stop = jest.fn();
        this.check = jest.fn();
        this.setInterval = jest.fn();
        this.getStatus = jest.fn().mockReturnValue({ name: this.name, isRunning: true });
        return this;
    });
    // Jest hoists `jest.mock` calls, so we ensure the `name` property is set on the function itself
    // so that `monitorClassMap.get(m.name)` works correctly in MonitorManager
    Object.defineProperty(MockMonitor, 'name', { value: className });
    return MockMonitor;
};

// Mock config for MonitorManager
jest.mock('../src/config', () => ({
    monitors: [
        { name: 'TestMonitor', enabled: true, file: 'test.json' },
        { name: 'DisabledMonitor', enabled: false },
        { name: 'NotFoundMonitor', enabled: true },
    ],
}));

describe('MonitorManager', () => {
    let monitorManager;
    let client;
    let MockTestMonitorClass;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        // Create a specific mock class for TestMonitorMonitor
        MockTestMonitorClass = createMockMonitorClass('TestMonitorMonitor');
        
        // Mock the module path where MonitorManager expects to find TestMonitorMonitor
        jest.doMock('./monitors/TestMonitorMonitor', () => MockTestMonitorClass, { virtual: true });
        
        monitorManager = require('../src/MonitorManager');
        client = new Discord.Client();
    });

    afterEach(() => {
        // jest.clearAllMocks() is handled by beforeEach's jest.clearAllMocks()
    });

    describe('initialize', () => {
        it('should initialize enabled monitors that are found', async () => {
            await monitorManager.initialize(client, [MockTestMonitorClass]);

            expect(monitorManager.getAllMonitors()).toHaveLength(1);
            expect(monitorManager.getMonitor('TestMonitor')).toBeDefined();
            const monitorInstance = monitorManager.getMonitor('TestMonitor');
            expect(monitorInstance.initialize).toHaveBeenCalledWith(client);
        });

        it('should not initialize disabled monitors', async () => {
            await monitorManager.initialize(client, [MockTestMonitorClass]);
            expect(monitorManager.getMonitor('DisabledMonitor')).toBeUndefined();
        });

        it('should log an error for enabled monitors that are not found', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            // Provide no monitor classes (or a different one), so NotFoundMonitor won't be found
            await monitorManager.initialize(client, [MockTestMonitorClass]); 
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('NotFoundMonitor'));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('controlling all monitors', () => {
        let monitorInstance;
        beforeEach(async () => {
            await monitorManager.initialize(client, [MockTestMonitorClass]);
            monitorInstance = monitorManager.getMonitor('TestMonitor');
        });
        
        it('should start all monitors', () => {
            monitorManager.startAll();
            expect(monitorInstance.start).toHaveBeenCalled();
        });

        it('should stop all monitors', () => {
            monitorManager.stopAll();
            expect(monitorInstance.stop).toHaveBeenCalled();
        });

        it('should check all monitors', () => {
            monitorManager.checkAll(client);
            expect(monitorInstance.check).toHaveBeenCalled();
        });

        it('should set the interval for all monitors', () => {
            const newInterval = 10;
            monitorManager.setAllIntervals(newInterval);
            expect(monitorInstance.setInterval).toHaveBeenCalledWith('0 */10 * * * *');
        });

        it('should get the status of all monitors', () => {
            const statuses = monitorManager.getStatusAll();
            expect(statuses).toEqual([{ name: 'TestMonitor', isRunning: true }]);
            expect(monitorInstance.getStatus).toHaveBeenCalled();
        });
    });
});