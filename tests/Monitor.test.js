let mockChannelSend = jest.fn();
let mockClientChannelsCacheGet = jest.fn();

const Monitor = require('../src/Monitor');
const { CronJob, CronTime } = require('cron');
const got = require('got');
const storage = require('../src/storage');
const Discord = require('discord.js');


jest.mock('cron');
jest.mock('got');
jest.mock('../src/storage');

jest.mock('discord.js', () => {
    const mClient = {
        channels: {
            cache: {
                get: mockClientChannelsCacheGet,
            },
        },
    };
    return { Client: jest.fn(() => mClient) };
});

const config = {
    interval: 5,
    DISCORDJS_TEXTCHANNEL_ID: 'mockChannelId',
    SINGLE_RUN: 'false'
};

jest.mock('../src/config', () => config);

// A concrete implementation of the abstract Monitor class for testing
class TestMonitor extends Monitor {
    constructor(name, monitorConfig) {
        super(name, monitorConfig);
    }

    parse(data) {
        return `parsed-${data}`;
    }

    compare(newData) {
        if (newData !== this.state) {
            return { oldData: this.state, newData };
        }
        return null;
    }
}

describe('Monitor', () => {
    let client;
    let testMonitor;
    const monitorConfig = { url: 'http://test.com', file: 'test.json' };

    beforeEach(() => {
        jest.clearAllMocks();
        mockChannelSend = jest.fn(); // Reset mock function before each test
        mockClientChannelsCacheGet = jest.fn(() => ({ send: mockChannelSend })); // Reset mock function before each test
        Discord.Client.mockImplementation(() => ({
            channels: { cache: { get: mockClientChannelsCacheGet } },
        }));

        client = new Discord.Client();
        testMonitor = new TestMonitor('TestMonitor', monitorConfig);
        testMonitor.client = client; // Manually set client for testing check method
    });

    it('should not be instantiable directly', () => {
        expect(() => new Monitor('AbstractMonitor', {})).toThrow('Abstract class "Monitor" cannot be instantiated directly.');
    });

    it('should require parse method to be implemented', () => {
        class NoParseMonitor extends Monitor {
            constructor(name, config) { super(name, config); }
        }
        expect(() => new NoParseMonitor('NoParse', {})).toThrow('Classes extending the "Monitor" abstract class must implement "parse".');
    });

    describe('cron job management', () => {
        it('should create a CronJob instance on construction', () => {
            expect(CronJob).toHaveBeenCalledTimes(1);
        });

        it('should start the cron job', () => {
            testMonitor.start();
            expect(testMonitor.cronJob.start).toHaveBeenCalled();
        });

        it('should stop the cron job', () => {
            testMonitor.stop();
            expect(testMonitor.cronJob.stop).toHaveBeenCalled();
        });

        it('should set the interval for the cron job', () => {
            testMonitor.setInterval('0 * * * *');
            expect(testMonitor.cronJob.setTime).toHaveBeenCalledWith(expect.any(CronTime));
        });

        it('should return the correct status', () => {
            testMonitor.cronJob.running = true;
            expect(testMonitor.getStatus()).toEqual({ name: 'TestMonitor', isRunning: true });
        });
    });

    describe('data handling', () => {
        it('should fetch data using got', async () => {
            got.mockResolvedValueOnce({ body: 'test data' });
            const data = await testMonitor.fetch();
            expect(got).toHaveBeenCalledWith('http://test.com');
            expect(data).toBe('test data');
        });

        it('should parse data using the implemented parse method', () => {
            const parsedData = testMonitor.parse('raw data');
            expect(parsedData).toBe('parsed-raw data');
        });

        it('should compare data and return changes if different', () => {
            testMonitor.state = 'old state';
            const changes = testMonitor.compare('new state');
            expect(changes).toEqual({ oldData: 'old state', newData: 'new state' });
        });

        it('should not return changes if data is the same', () => {
            testMonitor.state = 'same state';
            const changes = testMonitor.compare('same state');
            expect(changes).toBeNull();
        });
    });

    describe('check method', () => {
        it('should fetch, parse, compare, notify, and save state if changes are detected', async () => {
            got.mockResolvedValueOnce({ body: 'raw data' });
            testMonitor.state = 'old state';
            testMonitor.notify = jest.fn();
            storage.write.mockResolvedValueOnce(true);

            await testMonitor.check(client);

            expect(got).toHaveBeenCalledWith('http://test.com');
            expect(testMonitor.notify).toHaveBeenCalledWith({ oldData: 'old state', newData: 'parsed-raw data' });
            expect(storage.write).toHaveBeenCalledWith('test.json', 'parsed-raw data');
            expect(testMonitor.state).toBe('parsed-raw data');
        });

        it('should not notify or save state if no changes are detected', async () => {
            got.mockResolvedValueOnce({ body: 'raw data' });
            testMonitor.state = 'parsed-raw data'; // Initial state matches parsed new data
            testMonitor.notify = jest.fn();
            storage.write.mockResolvedValueOnce(true);

            await testMonitor.check(client);

            expect(got).toHaveBeenCalledWith('http://test.com');
            expect(testMonitor.notify).not.toHaveBeenCalled();
            expect(storage.write).not.toHaveBeenCalled();
            expect(testMonitor.state).toBe('parsed-raw data'); // State should remain the same
        });

        it('should log an error if fetching fails', async () => {
            got.mockRejectedValueOnce(new Error('Network error'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await testMonitor.check(client);

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error checking TestMonitor:'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });
    });

    describe('notify method', () => {
        it('should send a message to the configured channel', () => {
            testMonitor.notify({ oldData: 'a', newData: 'b' });
            expect(mockClientChannelsCacheGet).toHaveBeenCalledWith('mockChannelId');
            expect(mockChannelSend).toHaveBeenCalledWith('Detected changes for TestMonitor!');
        });

        it('should log an error if notification channel not found', () => {
            mockClientChannelsCacheGet.mockReturnValueOnce(undefined); // Simulate channel not found
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            testMonitor.notify({});

            expect(consoleLogSpy).toHaveBeenCalledWith('Changes detected for TestMonitor:', {});
            consoleLogSpy.mockRestore();
        });
    });

    describe('initialize method', () => {
        it('should load state and set client', async () => {
            storage.read.mockResolvedValueOnce('loaded state');
            await testMonitor.initialize(client);
            expect(testMonitor.client).toBe(client);
            expect(testMonitor.state).toBe('loaded state');
            expect(storage.read).toHaveBeenCalledWith('test.json');
        });
    });

    describe('loadState method', () => {
        it('should load state from storage', async () => {
            storage.read.mockResolvedValueOnce('loaded data');
            const state = await testMonitor.loadState();
            expect(state).toBe('loaded data');
            expect(storage.read).toHaveBeenCalledWith('test.json');
        });

        it('should return empty object if storage read fails', async () => {
            storage.read.mockRejectedValueOnce(new Error('Read error'));
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const state = await testMonitor.loadState();
            expect(state).toEqual({});
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Could not load state for TestMonitor'));
            consoleLogSpy.mockRestore();
        });
    });

    describe('saveState method', () => {
        it('should save state to storage', async () => {
            await testMonitor.saveState('new state');
            expect(storage.write).toHaveBeenCalledWith('test.json', 'new state');
        });
    });

    describe('getNotificationChannel method', () => {
        it('should return Discord channel when SINGLE_RUN is false', () => {
            config.SINGLE_RUN = 'false';
            const expectedChannel = { send: jest.fn() };
            mockClientChannelsCacheGet.mockReturnValue(expectedChannel);
            
            const channel = testMonitor.getNotificationChannel();
            expect(mockClientChannelsCacheGet).toHaveBeenCalledWith('mockChannelId');
            expect(channel).toBe(expectedChannel);
        });

        it('should return a mock channel when SINGLE_RUN is true', () => {
            config.SINGLE_RUN = 'true';
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const channel = testMonitor.getNotificationChannel();
            
            expect(channel).toBeDefined();
            expect(channel.send).toBeDefined();
            
            // Test text notification
            channel.send('test text');
            expect(consoleLogSpy).toHaveBeenCalledWith('[SINGLE_RUN] [TEXT] test text');

            // Test embed notification
            channel.send({ title: 'test embed', fields: [{ name: 'f1', value: 'v1' }] });
            expect(consoleLogSpy).toHaveBeenCalledWith('[SINGLE_RUN] [EMBED] test embed');
            expect(consoleLogSpy).toHaveBeenCalledWith('  f1: v1');

            consoleLogSpy.mockRestore();
            config.SINGLE_RUN = 'false'; // Reset for other tests
        });
    });
});
