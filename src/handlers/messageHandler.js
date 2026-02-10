const channelManager = require('../ChannelManager');

/**
 * Handles incoming messages by dispatching them to the ChannelManager.
 *
 * @param {import('discord.js').Message} message The message object from Discord.
 * @param {object} state The application state.
 * @param {object} _config The application configuration.
 */
async function handleMessage(message, state, _config) {
    await channelManager.handleMessage(message, state);
}

module.exports = { handleMessage };