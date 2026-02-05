const ChannelHandler = require('../ChannelHandler');

/**
 * Handler for Deals channel moderation.
 */
class DealsChannel extends ChannelHandler {
    /**
     * Handles the message for Deals moderation.
     * @param {import('discord.js').Message} message The message object.
     * @returns {Promise<boolean>} True if handled.
     */
    async process(message) {
        const hasLink = /https?:\/\/[^\s]+/.test(message.content);
        const hasAttachment = message.attachments.size > 0;

        if (hasLink || hasAttachment) {
            // It's a deal, allow it.
            return true;
        }

        // Not a deal, delete and notify user.
        try {
            await message.delete();
            await message.author.send(
                `Hi ${message.author.username}, your message in <#${message.channel.id}> was removed because it doesn't appear to be a deal. ` +
                `This channel is only for sharing deals (messages must contain a link or an image). ` +
                `Please use threads to discuss existing deals.`
            );
        } catch (error) {
            console.error('Error in DealsChannel handler:', error);
        }

        return true;
    }
}

module.exports = DealsChannel;
