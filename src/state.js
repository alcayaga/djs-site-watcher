const storage = require('./storage');

const state = {
    sitesToMonitor: [],
    settings: { interval: 5 },
    responses: [],

    load() {
        this.sitesToMonitor = storage.loadSites();
        this.settings = storage.loadSettings();
        this.responses = storage.loadResponses();
    },
};

module.exports = state;
