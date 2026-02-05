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
                    name: message.content.trim().substring(0, 100) || 'Discusión de la oferta',
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
            `Hola ${message.author.username}, tu mensaje en <#${message.channel.id}> fue eliminado porque no parece ser una oferta. Este canal es solo para compartir ofertas (los mensajes deben contener un enlace o una imagen). Por favor, usa hilos para discutir las ofertas existentes.`
        );

        return true;
    }
}

module.exports = DealsChannel;
