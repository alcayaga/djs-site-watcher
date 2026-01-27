const Discord = require('discord.js');
const { handleCommand, commands } = require('./command-handler.js');
const storage = require('./storage.js');
const { CronJob } = require('cron');

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

jest.mock('./site-monitor');

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
jest.mock('discord.js', () => {
    const originalDiscord = jest.requireActual('discord.js');
    
    const MessageEmbed = jest.fn(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        addField: jest.fn().mockReturnThis(),
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
        };
    });

    return {
        ...originalDiscord,
        Client: jest.fn(() => ({
            channels: {
                cache: {
                    get: jest.fn(() => ({
                        send: jest.fn().mockResolvedValue(true),
                    })),
                },
            },
        })),
        MessageEmbed,
        Collection,
    };
});

describe('Discord Commands Functionality Test', () => {
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

    beforeAll(() => {
        process.env.DISCORDJS_ADMINCHANNEL_ID = 'admin-channel';
        process.env.DISCORDJS_ROLE_ID = 'admin-role';
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockClient = new Discord.Client(); 
        mockChannel = {
            send: jest.fn(),
            id: 'admin-channel'
        };
        mockClient.channels.cache.get.mockReturnValue(mockChannel);

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
            reply: jest.fn(),
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

        const got = require('got');
        got.mockResolvedValue({ body: '<html><head><title>Example</title></head><body>Hello</body></html>' });

        const { JSDOM } = require('jsdom');
        JSDOM.mockImplementation(() => ({
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

    describe('!add command', () => {
        it('should add a new site to the monitor list', async () => {
            mockMessage.content = '!add http://example.com';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(storage.saveSites).toHaveBeenCalled();
            expect(mockState.sitesToMonitor.length).toBe(1);
            expect(mockState.sitesToMonitor[0].url).toBe('http://example.com');
            expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
                setTitle: expect.any(Function),
                setColor: expect.any(Function),
                addField: expect.any(Function),
            }));
        });

        it('should add a new site with a quoted CSS selector containing spaces', async () => {
            mockMessage.content = '!add http://example.com "div.mod-date > time"';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(storage.saveSites).toHaveBeenCalled();
            expect(mockState.sitesToMonitor.length).toBe(1);
            expect(mockState.sitesToMonitor[0].url).toBe('http://example.com');
            expect(mockState.sitesToMonitor[0].css).toBe('div.mod-date > time');
            expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
                setTitle: expect.any(Function),
                setColor: expect.any(Function),
                addField: expect.any(Function),
            }));
        });
    });

    describe('!remove command', () => {
        it('should remove a site from the monitor list', async () => {
            // Add a site first
            mockState.sitesToMonitor.push({ id: 'example.com', url: 'http://example.com' });

            mockMessage.content = '!remove 1';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(storage.saveSites).toHaveBeenCalled();
            expect(mockState.sitesToMonitor.length).toBe(0);
            expect(mockChannel.send).toHaveBeenCalledWith('Removed **example.com** from list.');
        });
    });

    describe('!list command', () => {
        it('should list the monitored sites', async () => {
            // Add a site first
            mockState.sitesToMonitor.push({
                id: 'example.com',
                url: 'http://example.com',
                css: 'h1',
                lastChecked: 'never',
                lastUpdated: 'never'
            });

            mockMessage.content = '!list';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);
            
            expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
                setTitle: expect.any(Function),
                setColor: expect.any(Function),
                addField: expect.any(Function),
            }));
            const messageEmbed = mockChannel.send.mock.calls[0][0];
            expect(messageEmbed.setTitle).toHaveBeenCalledWith('1 sitio(s) están siendo monitoreados:');
            expect(messageEmbed.addField).toHaveBeenCalledWith(
                'example.com',
                'URL: http://example.com\nCSS: `h1`\nChecked: never\nUpdated: never\nRemove: `!remove 1`'
            );
        });
    });

    describe('!show command', () => {
        it('should show the monitored sites', async () => {
            // Add a site first
            mockState.sitesToMonitor.push({
                id: 'example.com',
                url: 'http://example.com',
                css: 'h1',
                lastChecked: 'never',
                lastUpdated: 'never'
            });

            mockMessage.content = '!show';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
                setTitle: expect.any(Function),
                setColor: expect.any(Function),
                addField: expect.any(Function),
            }));
            const messageEmbed = mockChannel.send.mock.calls[0][0];
            expect(messageEmbed.setTitle).toHaveBeenCalledWith('1 sitio(s) están siendo monitoreados:');
            expect(messageEmbed.addField).toHaveBeenCalledWith(
                'example.com',
                'URL: http://example.com\nCSS: `h1`\nChecked: never\nUpdated: never\nRemove: `!remove 1`'
            );
        });
    });

    describe('!update command', () => {
        it('should trigger a manual update of the monitored sites', async () => {
            const siteMonitor = require('./site-monitor');
            // Add a site first
            mockState.sitesToMonitor.push({
                id: 'example.com',
                url: 'http://example.com',
                css: 'h1',
                lastChecked: 'never',
                lastUpdated: 'never'
            });

            mockMessage.content = '!update';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith('Updating `1` site(s)...');
            expect(siteMonitor.checkSites).toHaveBeenCalledWith(mockClient, mockState.sitesToMonitor, mockChannel);
            expect(mockChannel.send).toHaveBeenCalledWith('Done...');
        });
    });

    describe('!interval command', () => {
        it('should update the monitoring interval', async () => {
            mockMessage.content = '!interval 10';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(storage.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
                interval: 10
            }));
            expect(mockConfig.interval).toBe(10);
            expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining('Interval set to \n10\n minutes.'));
        });
    });

    describe('!start command', () => {
        it('should start the monitoring', async () => {
            mockMessage.content = '!start';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockCronUpdate.start).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Started monitoring...');
        });
    });

    describe('!stop command', () => {
        it('should stop the monitoring', async () => {
            mockMessage.content = '!stop';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockCronUpdate.stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Paused website monitoring... Type `!start` to resume.');
        });
    });

    describe('!status command', () => {
        it('should show the monitoring status', async () => {
            mockMessage.content = '!status';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith('Site Watcher is running with an interval of `5` minute(s).');
        });
    });

    describe('!carrier command', () => {
        it('should show the carrier monitor status', async () => {
            mockMessage.content = '!carrier status';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith('Carrier monitor is running.');
        });

        it('should start the carrier monitor', async () => {
            mockMessage.content = '!carrier start';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockCarrierCron.start).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Carrier monitor started.');
        });

        it('should stop the carrier monitor', async () => {
            mockMessage.content = '!carrier stop';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockCarrierCron.stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Carrier monitor stopped.');
        });
    });

    describe('!esim command', () => {
        it('should show the esim monitor status', async () => {
            mockMessage.content = '!esim status';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith('eSIM monitor is running.');
        });

        it('should start the esim monitor', async () => {
            mockMessage.content = '!esim start';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockAppleEsimCron.start).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('eSIM monitor started.');
        });

        it('should stop the esim monitor', async () => {
            mockMessage.content = '!esim stop';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockAppleEsimCron.stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('eSIM monitor stopped.');
        });
    });

    describe('!applepay command', () => {
        it('should show the applepay monitor status', async () => {
            mockMessage.content = '!applepay status';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith('Apple Pay monitor is running.');
        });

        it('should start the applepay monitor', async () => {
            mockMessage.content = '!applepay start';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockApplePayCron.start).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Apple Pay monitor started.');
        });

        it('should stop the applepay monitor', async () => {
            mockMessage.content = '!applepay stop';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockApplePayCron.stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Apple Pay monitor stopped.');
        });
    });

    describe('!applefeature command', () => {
        it('should show the applefeature monitor status', async () => {
            mockMessage.content = '!applefeature status';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockChannel.send).toHaveBeenCalledWith('Apple Feature monitor is running.');
        });

        it('should start the applefeature monitor', async () => {
            mockMessage.content = '!applefeature start';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockAppleFeatureCron.start).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Apple Feature monitor started.');
        });

        it('should stop the applefeature monitor', async () => {
            mockMessage.content = '!applefeature stop';

            await handleCommand(mockMessage, mockClient, mockState, mockConfig, mockCronUpdate, mockCarrierCron, mockAppleFeatureCron, mockApplePayCron, mockAppleEsimCron);

            expect(mockAppleFeatureCron.stop).toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalledWith('Apple Feature monitor stopped.');
        });
    });
});
