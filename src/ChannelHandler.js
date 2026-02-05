/**
 * Abstract base class for all channel handlers.
 *
 * @abstract
 */
class ChannelHandler {
    /**
     * Creates an instance of ChannelHandler.
     * @param {string} name The name of the handler.
     * @param {object} handlerConfig The configuration for this handler.
     */
    constructor(name, handlerConfig) {
        if (this.constructor === ChannelHandler) {
            throw new TypeError('Abstract class "ChannelHandler" cannot be instantiated directly.');
        }

        this.name = name;
        this.config = handlerConfig;
        this.client = null;
    }

    /**
     * Initializes the handler with the Discord client.
     * @param {import('discord.js').Client} client 
     */
    initialize(client) {
        this.client = client;
    }

    /**
     * Entry point for message handling. Performs common checks before calling process().
     * @param {import('discord.js').Message} message 
     * @param {object} state 
     * @param {object} config 
     * @returns {Promise<boolean>}
     */
    async handle(message, state, config) {
        // Common checks: ignore bots (unless configured otherwise) and verify channel ID if configured
        const shouldIgnoreBots = this.config.ignoreBots !== false;
        if ((shouldIgnoreBots && message.author.bot) || (this.config.channelId && this.config.channelId !== message.channel.id)) {
            return false;
        }
        return this.process(message, state, config);
    }

    /**
     * Specific handling logic implemented by subclasses.
     * @abstract
     * @returns {Promise<boolean>}
     */
    async process() {
        throw new Error('Classes extending "ChannelHandler" must implement "process".');
    }
}

module.exports = ChannelHandler;