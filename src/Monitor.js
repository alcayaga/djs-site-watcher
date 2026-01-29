const { CronJob, CronTime } = require('cron'); // Import CronTime
const got = require('got');
const storage = require('./storage');
const config = require('./config');

/**
 * Abstract base class for all monitors.
 * Each monitor instance manages its own cron job.
 *
 * @abstract
 */
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

        this.cronJob = new CronJob(`0 */${config.interval} * * * *`, () => this.check(this.client), null, false);
    }

    /**
     * Starts the monitor's cron job.
     */
    start() {
        this.cronJob.start();
    }

    /**
     * Stops the monitor's cron job.
     */
    stop() {
        this.cronJob.stop();
    }

    /**
     * Gets the running status of the monitor.
     * @returns {{name: string, isRunning: boolean}} The status of the monitor.
     */
    getStatus() {
        return { name: this.name, isRunning: this.cronJob.running };
    }

    /**
     * Sets the interval for the cron job.
     * @param {string} cronTime The new cron time string.
     */
    setInterval(cronTime) {
        this.cronJob.setTime(new CronTime(cronTime));
    }

    /**
     * The main check logic for the monitor.
     * Orchestrates fetching, parsing, comparing, and notifying.
     * @param {Discord.Client} client The Discord client instance.
     */
    async check(client) {
        console.log(`Checking for ${this.name} updates...`);
        try {
            const data = await this.fetch();
            const newData = this.parse(data);
            const changes = this.compare(newData);

            if (changes) {
                this.notify(client, changes);
                await this.saveState(newData);
                this.state = newData;
            }
        } catch (error) {
            console.error(`Error checking ${this.name}:`, error);
        }
    }

    /**
     * Fetches the data from the monitor's URL.
     * @returns {Promise<string>} The fetched data.
     */
    async fetch() {
        const response = await got(this.config.url);
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
     * @param {Discord.Client} client The Discord client instance.
     * @param {*} changes The changes to notify about.
     */
    notify(client, changes) {
        console.log(`Changes detected for ${this.name}:`, changes);
        const channel = client.channels.cache.get(config.DISCORDJS_TEXTCHANNEL_ID);
        if (channel) {
            channel.send(`Detected changes for ${this.name}!`);
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
        } catch (error) {
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
