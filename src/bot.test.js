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

const Discord = require('discord.js');
const storage = require('./storage.js');
const got = require('got');
const { JSDOM } = require('jsdom');

jest.mock('./storage', () => ({
    loadSites: jest.fn(),
    saveSites: jest.fn(),
    loadSettings: jest.fn(),
    loadResponses: jest.fn(),
}));

jest.mock('got', () => jest.fn());

jest.mock('jsdom', () => ({
    JSDOM: jest.fn(),
}));

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
            /**
             * Sets a key-value pair in the collection.
             * @param {*} key - The key.
             * @param {*} value - The value.
             * @returns {void}
             */
            set: (key, value) => map.set(key, value),
            /**
             * Gets a value by its key.
             * @param {*} key - The key.
             * @returns {*} The value.
             */
            get: (key) => map.get(key),
            /**
             * Finds a value in the collection.
             * @param {Function} fn - The function to test for each element.
             * @returns {*} The first element that satisfies the provided testing function.
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
             * @returns {Iterator} An iterator for the values.
             */
            values: () => map.values(),
        };
    });
    
    const on = jest.fn();
    const client = {
        channels: {
            cache: {
                get: jest.fn(() => ({
                    send: jest.fn().mockResolvedValue(true),
                })),
            },
        },
        on,
        emit: jest.fn(),
        user: {
            tag: 'test-bot'
        }
    };

    return {
        ...originalDiscord,
        Client: jest.fn(() => client),
        MessageEmbed,
        Collection,
    };
});

/**
 * Test suite for the main bot functionality.
 */
describe('Bot', () => {
    let client;

    /**
     * Resets mocks and initializes a new Discord client before each test.
     */
    beforeEach(() => {
        jest.clearAllMocks();
        
        storage.loadSites.mockReturnValue([]);
        storage.loadSettings.mockReturnValue({ interval: 5 });
        storage.loadResponses.mockReturnValue([]);

        require('./bot.js');
        client = new Discord.Client();
    });

    /**
     * Tests the initialization process of the bot.
     */
describe('initialization', () => {
        /**
         * Test case to verify that the bot fetches and sets `lastContent` for sites missing it during initialization.
         */
        it('should fetch and set lastContent for sites that are missing it', async () => {
            const sitesWithoutLastContent = [{
                id: 'example.com',
                url: 'http://example.com',
                css: 'h1',
                lastChecked: 'never',
                lastUpdated: 'never'
            }];
            storage.loadSites.mockReturnValue(sitesWithoutLastContent);

            const mockHtml = '<html><head><title>Example</title></head><body><h1>Hello</h1></body></html>';
            got.mockResolvedValue({ body: mockHtml });

            const dom = {
                window: {
                    document: {
                        querySelector: jest.fn().mockImplementation((selector) => {
                            if (selector === 'h1') {
                                return { textContent: 'Hello' };
                            } else if (selector === 'head') {
                                return { textContent: '' };
                            }
                            return null;
                        }),
                    },
                },
            };
            JSDOM.mockImplementation(() => dom);

            // This will trigger the 'ready' event
            const readyCallback = client.on.mock.calls.find(call => call[0] === 'ready')[1];
            await readyCallback();

            expect(got).toHaveBeenCalledWith('http://example.com');
            expect(storage.saveSites).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'example.com',
                        lastContent: 'Hello',
                    }),
                ])
            );
        });
    });
});
