const config = require('./config');

/**
 * Manages the loading, initialization, and control of various monitor instances.
 * This class acts as a central hub for all monitors in the application.
 */
class MonitorManager {
    /**
     * Creates an instance of MonitorManager.
     */
    constructor() {
        this.monitors = [];
    }

    /**
     * Loads, instantiates, and initializes all monitors based on the config.
     * @param {Discord.Client} client The Discord client instance.
     * @param {Array<Monitor>} monitorClasses A list of monitor classes to load.
     */
    async initialize(client, monitorClasses = []) {
        const monitorClassMap = new Map(monitorClasses.map(m => [m.name, m]));

        for (const monitorConfig of config.monitors) {
            if (monitorConfig.enabled) {
                const monitorName = monitorConfig.name;
                const MonitorClass = monitorClassMap.get(`${monitorName}Monitor`);

                if (MonitorClass) {
                    try {
                        const monitorInstance = new MonitorClass(monitorName, monitorConfig);
                        await monitorInstance.initialize(client);
                        this.monitors.push(monitorInstance);
                    } catch (e) {
                        console.error(`Error loading monitor ${monitorName}:`, e);
                    }
                } else {
                    console.error(`Monitor "${monitorName}" is enabled in config, but no matching monitor class was provided.`);
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
     * Sets the cron interval for all managed monitors that don't have a custom interval.
     * @param {number} minutes The interval in minutes.
     */
    setAllIntervals(minutes) {
        const cronTime = minutes < 60 ? `0 */${minutes} * * * *` : `0 0 * * * *`;
        this.monitors.forEach(monitor => {
            // Only override if the monitor doesn't have a specific interval in its config
            if (!monitor.config?.interval) {
                monitor.setInterval(cronTime);
            }
        });
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
     */
    checkAll() {
        this.monitors.forEach(monitor => monitor.check());
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
