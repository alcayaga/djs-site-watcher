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
            // It's a deal, create a thread for discussion.
            try {
                await message.startThread({
                    name: message.content.substring(0, 100) || 'Deal Discussion',
                    autoArchiveDuration: 10080, // 7 days
                });
            } catch (error) {
                console.error('Error creating thread in DealsChannel handler:', error);
            }
            return false;
        }

        // Not a deal, delete and notify user.
        try {
            await message.delete();
        } catch (deleteError) {
            console.error('Error deleting message in DealsChannel handler:', deleteError);
            // If deletion fails, we return early as we can't notify for a message that wasn't removed.
            return true;
        }

        // Send notification and let any errors propagate.
        await message.author.send(
            `Hi ${message.author.username}, your message in <#${message.channel.id}> was removed because it doesn't appear to be a deal. This channel is only for sharing deals (messages must contain a link or an image). Please use threads to discuss existing deals.`
        );

        return true;
    }
}

module.exports = DealsChannel;
