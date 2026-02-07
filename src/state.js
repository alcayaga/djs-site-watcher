/**
 * Manages the application's state, including sites to monitor, settings, and responses.
 * It loads this data from storage.
 * @module state
 */
const storage = require('./storage');

const state = {
    settings: { interval: 5 },
    responses: [],

    /**
     * Loads settings and responses from storage.
     * @returns {void}
     */
    load() {
        this.settings = storage.loadSettings();
        this.responses = storage.loadResponses();
    },
};

module.exports = state;
