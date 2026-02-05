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
     * @param {object} config The application configuration.
     * @returns {Promise<boolean>} True if handled.
     */
    async process(message, state, config) {
        const ap_message = message.content.trim();

        for (const response of state.responses) {
            const ap_match = response.trigger_regex.exec(ap_message);
            if (ap_match !== null) {
                message.channel.sendTyping();

                // Wait for the configured delay before sending the response
                await new Promise(resolve => setTimeout(resolve, config.AP_RESPONSE_DELAY));

                const reply_id = Math.floor(Math.random() * response.replies.length);
                const reply = response.replies[reply_id];

                if (reply.img_response !== "") {
                    const img = new Discord.AttachmentBuilder(reply.img_response);
                    message.channel.send({ files: [img] });
                }

                if (reply.text_response !== "") {
                    message.reply(reply.text_response);
                }

                return true;
            }
        }
        return false;
    }
}

module.exports = QAChannel;
