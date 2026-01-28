const config = require('./config');
const fs = require('fs');
const path = require('path');

class MonitorManager {
    constructor() {
        this.monitors = [];
    }

    /**
     * Loads, instantiates, and initializes all monitors based on the config.
     * @param {Discord.Client} client The Discord client instance.
     */
    async initialize(client) {
        const monitorFiles = fs.readdirSync(path.join(__dirname, 'monitors')).map(file => path.parse(file).name);

        for (const monitorConfig of config.monitors) {
            if (monitorConfig.enabled) {
                const monitorName = monitorConfig.name;
                const expectedFileName = `${monitorName}Monitor`;
                if (monitorFiles.includes(expectedFileName)) {
                    try {
                        const MonitorClass = require(`./monitors/${expectedFileName}`);
                        const monitorInstance = new MonitorClass(monitorName, monitorConfig);
                        await monitorInstance.initialize(client);
                        this.monitors.push(monitorInstance);
                    } catch (e) {
                        console.error(`Error loading monitor ${monitorName}:`, e);
                    }
                } else {
                    console.error(`Monitor "${monitorName}" is enabled in config, but no matching "${expectedFileName}.js" file was found in "src/monitors/".`);
                }
            }
        }
    }

    /**
     * Starts all managed monitors.
     */
    startAll() {
        this.monitors.forEach(monitor => monitor.start());
    }

    /**
     * Stops all managed monitors.
     */
    stopAll() {
        this.monitors.forEach(monitor => monitor.stop());
    }

    /**
     * Sets the cron interval for all managed monitors.
     * @param {number} minutes The interval in minutes.
     */
    setAllIntervals(minutes) {
        const cronTime = minutes < 60 ? `0 */${minutes} * * * *` : `0 0 * * * *`;
        this.monitors.forEach(monitor => monitor.setInterval(cronTime));
    }

    /**
     * Gets the status of all managed monitors.
     * @returns {Array<{name: string, isRunning: boolean}>} A list of monitor statuses.
     */
    getStatusAll() {
        return this.monitors.map(monitor => monitor.getStatus());
    }

    /**
     * Triggers an immediate check for all managed monitors.
     * @param {Discord.Client} client The Discord client instance.
     */
    checkAll(client) {
        this.monitors.forEach(monitor => monitor.check(client));
    }

    /**
     * Gets a specific monitor instance by name.
     * @param {string} name The name of the monitor to get.
     * @returns {Monitor|undefined} The monitor instance, or undefined if not found.
     */
    getMonitor(name) {
        return this.monitors.find(monitor => monitor.name.toLowerCase() === name.toLowerCase());
    }

    /**
     * Gets all monitor instances.
     * @returns {Array<Monitor>} A list of all monitor instances.
     */
    getAllMonitors() {
        return this.monitors;
    }
}

// Export a singleton instance
module.exports = new MonitorManager();
