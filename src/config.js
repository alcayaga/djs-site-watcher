/**
 * Configuration module that loads environment variables and settings from storage.
 * @module config
 */
require('dotenv').config();

const storage = require('./storage.js');

const config = storage.loadSettings();

config.DISCORDJS_BOT_TOKEN = process.env.DISCORDJS_BOT_TOKEN;
config.DISCORDJS_TEXTCHANNEL_ID = process.env.DISCORDJS_TEXTCHANNEL_ID;
config.DISCORDJS_ADMINCHANNEL_ID = process.env.DISCORDJS_ADMINCHANNEL_ID;
config.DISCORDJS_ROLE_ID = process.env.DISCORDJS_ROLE_ID;
config.SINGLE_RUN = process.env.SINGLE_RUN;

module.exports = config;
