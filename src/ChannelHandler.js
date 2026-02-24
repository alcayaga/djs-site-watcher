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
     * This method is part of a "Chain of Responsibility" pattern.
     * 
     * @param {import('discord.js').Message} message 
     * @param {object} state 
     * @returns {Promise<boolean>} A boolean indicating if the message processing chain should continue.
     *                             - `true`: The message was fully handled or consumed (e.g., deleted or replied to). Stops the chain.
     *                             - `false`: The message was ignored or processed in a way that allows other handlers to act on it. Continues the chain.
     */
    async handle(message, state) {
        // Common checks: ignore bots (unless configured otherwise)
        const shouldIgnoreBots = this.config.ignoreBots !== false;
        if (shouldIgnoreBots && message.author.bot) {
            return false;
        }
        return this.process(message, state);
    }

    /**
     * Specific handling logic implemented by subclasses.
     * @abstract
     * @param {import('discord.js').Message} _message 
     * @param {object} _state 
     * @returns {Promise<boolean>} `true` if the message was fully handled, stopping the chain; `false` to allow subsequent handlers to process it.
     */
    // eslint-disable-next-line no-unused-vars
    async process(_message, _state) {
        throw new Error('Classes extending "ChannelHandler" must implement "process".');
    }
}

module.exports = ChannelHandler;