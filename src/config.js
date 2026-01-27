/**
 * Configuration module that loads environment variables and settings from storage.
 * @module config
 */
require('dotenv').config();

const storage = require('./storage.js');

const config = {
    ...process.env,
    ...storage.loadSettings(),
};

module.exports = config;
