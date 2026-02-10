const channelManager = require('../ChannelManager');

/**
 * Handles incoming messages by dispatching them to the ChannelManager.
 *
 * @param {import('discord.js').Message} message The message object from Discord.
 * @param {object} state The application state.
 * @param {object} config The application configuration.
 */
// eslint-disable-next-line no-unused-vars
async function handleMessage(message, state, config) {
    await channelManager.handleMessage(message, state);
}

module.exports = { handleMessage };