const Discord = require('discord.js');
const ChannelHandler = require('../ChannelHandler');

/**
 * Handler for Q&A (Auto-responses) channel.
 */
class QAChannel extends ChannelHandler {
    /**
     * Handles the message for Q&A logic.
     * @param {Discord.Message} message The message object.
     * @param {object} state The application state.
     * @returns {Promise<boolean>} True if handled.
     */
    async process(message, state) {
        const ap_message = message.content.trim();

        for (const response of state.responses) {
            const ap_match = response.trigger_regex.exec(ap_message);
            if (ap_match !== null) {
                const reply_id = Math.floor(Math.random() * response.replies.length);
                const reply = response.replies[reply_id];

                const responsePayload = {};
                if (reply.img_response) {
                    responsePayload.files = [new Discord.AttachmentBuilder(reply.img_response)];
                }

                if (reply.text_response) {
                    responsePayload.content = reply.text_response;
                }

                const hasContent = Object.keys(responsePayload).length > 0;

                if (hasContent) {
                    message.channel.sendTyping();

                    // Wait for the configured delay before sending the response
                    await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));

                    await message.reply(responsePayload);
                }

                await this._applyReactions(message, response, reply);

                return true;
            }
        }
        return false;
    }

    /**
     * Selects a single reaction from a pool and formats it for use.
     * @param {string|string[]} reactionPool The reaction(s) to choose from.
     * @returns {string|null} A single emoji or custom emoji ID, or null.
     * @private
     */
    _getSingleReaction(reactionPool) {
        if (!reactionPool) return null;

        const selected = Array.isArray(reactionPool)
            ? reactionPool[Math.floor(Math.random() * reactionPool.length)]
            : reactionPool;

        if (typeof selected !== 'string' || !selected) return null;

        // Extract ID for custom emojis <:name:id> or a:name:id
        const match = selected.match(/<?(?:a:)?\w+:(?<id>\d+)>?/);
        return match ? match.groups.id : selected;
    }

    /**
     * Applies reactions to a message based on response and reply configurations.
     * @param {Discord.Message} message The message to react to.
     * @param {object} response The top-level response object.
     * @param {object} reply The selected reply object.
     * @returns {Promise<void>}
     * @private
     */
    async _applyReactions(message, response, reply) {
        const finalReactions = new Set();

        for (const reactionPool of [response.reactions, reply.reactions]) {
            const emoji = this._getSingleReaction(reactionPool);
            if (emoji) {
                finalReactions.add(emoji);
            }
        }

        const reactionPromises = [...finalReactions].map(emoji =>
            message.react(emoji)
        );
        try {
            await Promise.all(reactionPromises);
        } catch (error) {
            console.error(`[QAChannel] Failed to apply one or more reactions on message ${message.id} in channel ${message.channel.id}:`, error);
        }
    }
}

module.exports = QAChannel;
