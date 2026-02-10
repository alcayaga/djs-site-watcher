const channelManager = require('../ChannelManager');

/**
 * Handles incoming messages by dispatching them to the ChannelManager.
 *
 * @param {import('discord.js').Message} message The message object from Discord.
 * @param {object} state The application state.
 */
async function handleMessage(message, state) {
    await channelManager.handleMessage(message, state);
}

module.exports = { handleMessage };