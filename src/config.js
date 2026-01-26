require('dotenv').config();

const storage = require('./storage.js');

const config = {
    ...process.env,
    ...storage.loadSettings(),
};

module.exports = config;
