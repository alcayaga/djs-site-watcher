const { CronJob, CronTime } = require('cron'); // Import CronTime
const got = require('got');
const storage = require('./storage');
const config = require('./config');
const { getSafeGotOptions } = require('./utils/network');

/**
 * Abstract base class for all monitors.
 * Each monitor instance manages its own cron job.
 *
 * @abstract
 */
class Monitor {
    /**
     * Creates an instance of Monitor.
     * @param {string} name The name of the monitor.
     * @param {object} monitorConfig The configuration object for this monitor.
     */
    constructor(name, monitorConfig) {
        if (this.constructor === Monitor) {
            throw new TypeError('Abstract class "Monitor" cannot be instantiated directly.');
        }
        if (this.parse === undefined) {
            throw new TypeError('Classes extending the "Monitor" abstract class must implement "parse".');
        }

        this.name = name;
        this.config = monitorConfig;
        this.state = {};

        this._cronJob = new CronJob(`0 */${config.interval} * * * *`, () => this.check(), null, false);
        this._isRunning = false;
    }

    /**
     * Starts the monitor's cron job.
     */
    start() {
        this._cronJob.start();
        this._isRunning = true;
    }

    /**
     * Stops the monitor's cron job.
     */
    stop() {
        this._cronJob.stop();
        this._isRunning = false;
    }

    /**
     * Gets the running status of the monitor.
     * @returns {{name: string, isRunning: boolean}} The status of the monitor.
     */
    getStatus() {
        return { name: this.name, isRunning: this._isRunning };
    }

    /**
     * Sets the interval for the cron job.
     * @param {string} cronTime The new cron time string.
     */
    setInterval(cronTime) {
        this._cronJob.setTime(new CronTime(cronTime));
    }

    /**
     * The main check logic for the monitor.
     * Orchestrates fetching, parsing, comparing, and notifying.
     */
    async check() {
        console.log(`Checking for ${this.name} updates...`);
        try {
            const data = await this.fetch();
            const newData = this.parse(data);
            const changes = this.compare(newData);

            if (changes) {
                await this.notify(changes);
                await this.saveState(newData);
                this.state = newData;
            }
        } catch (error) {
            console.error(`Error checking ${this.name}:`, error);
        }
    }

    /**
     * Gets the notification channel for the monitor.
     * Returns a mock channel that logs to console if SINGLE_RUN is enabled.
     * @returns {object|Discord.TextChannel} The notification channel or a mock channel.
     */
    getNotificationChannel() {
        if (String(config.SINGLE_RUN).toLowerCase() === 'true') {
            return {
                /**
                 * Mocks the Discord channel send method by logging to console.
                 * @param {string|object} content The message content or embed object.
                 * @returns {Promise<void>}
                 */
                send: async (content) => {
                    if (content && typeof content === 'object' && content.title) {
                        console.log(`[SINGLE_RUN] [EMBED] ${content.title}`);
                        if (content.fields) {
                            content.fields.forEach(f => console.log(`  ${f.name}: ${f.value}`));
                        }
                    } else {
                        console.log(`[SINGLE_RUN] [TEXT] ${content}`);
                    }
                }
            };
        }
        
        const channelId = this.config.channelId;
        return this.client.channels.cache.get(channelId);
    }

    /**
     * Fetches the data from the monitor's URL.
     * @returns {Promise<string>} The fetched data.
     */
    async fetch() {
        const response = await got(this.config.url, getSafeGotOptions());
        return response.body;
    }

    /**
     * Compares the new data with the old data.
     * @param {*} newData The new data parsed from the source.
     * @returns {*} The changes detected, or null if no changes.
     */
    compare(newData) {
        // Basic implementation: check if stringified data is different.
        // Subclasses should override this for more complex comparisons.
        if (JSON.stringify(this.state) !== JSON.stringify(newData)) {
            return { oldData: this.state, newData };
        }
        return null;
    }

    /**
     * Sends a notification about the changes.
     * @param {*} changes The changes to notify about.
     * @returns {Promise<void>}
     */
    async notify(changes) {
        console.log(`Changes detected for ${this.name}:`, changes);
        const channel = this.getNotificationChannel();
        if (channel) {
            await channel.send(`Detected changes for ${this.name}!`);
        }
    }
    
    /**
     * Loads the initial state for the monitor.
     * @param {Discord.Client} client The Discord client instance.
     */
    async initialize(client) {
        this.client = client;
        this.state = await this.loadState();
        console.log(`Initialized monitor: ${this.name}`);
    }

    /**
     * Loads the monitor's state from storage.
     * @returns {Promise<object>} The loaded state.
     */
    async loadState() {
        try {
            return await storage.read(this.config.file);
        } catch {
            console.log(`Could not load state for ${this.name} from ${this.config.file}. Starting fresh.`);
            return {};
        }
    }

    /**
     * Saves the monitor's state to storage.
     * @param {object} newState The new state to save.
     */
    async saveState(newState) {
        await storage.write(this.config.file, newState);
    }
}

module.exports = Monitor;
