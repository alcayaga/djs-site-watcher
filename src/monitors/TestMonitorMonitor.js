// This is a mock file for testing purposes.
const Monitor = require('../Monitor');

/**
 * This is a mock monitor class used for testing purposes.
 * It extends the base Monitor class.
 */
class TestMonitorMonitor extends Monitor {
    /**
     * Creates an instance of TestMonitorMonitor.
     * @param {string} name The name of the monitor.
     * @param {object} monitorConfig The configuration object for this monitor.
     */
    constructor(name, monitorConfig) {
        super(name, monitorConfig);
    }
}

module.exports = TestMonitorMonitor;
