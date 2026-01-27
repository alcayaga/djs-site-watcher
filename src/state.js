/**
 * Manages the application's state, including sites to monitor, settings, and responses.
 * It loads this data from storage.
 * @module state
 */
const storage = require('./storage');

const state = {
    sitesToMonitor: [],
    settings: { interval: 5 },
    responses: [],

    /**
     * Loads sites to monitor, settings, and responses from storage.
     * @returns {void}
     */
    load() {
        this.sitesToMonitor = storage.loadSites();
        this.settings = storage.loadSettings();
        this.responses = storage.loadResponses();
    },
};

module.exports = state;
