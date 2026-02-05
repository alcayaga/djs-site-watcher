const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Manages the loading and execution of channel-specific message handlers.
 */
class ChannelManager {
    /**
     * Creates an instance of ChannelManager.
     */
    constructor() {
        this.handlers = [];
    }

    /**
     * Dynamically loads and initializes all channel handlers based on config.
     * @param {import('discord.js').Client} client The Discord client instance.
     */
    initialize(client) {
        const channelsPath = path.join(__dirname, 'channels');
        if (!fs.existsSync(channelsPath)) return;

        const handlerFiles = fs.readdirSync(channelsPath).filter(file => file.endsWith('.js'));
        const handlerClassMap = new Map();

        for (const file of handlerFiles) {
            try {
                const HandlerClass = require(path.join(channelsPath, file));
                // We use the class name (e.g. "QAChannel" -> "QA") or a static property if we had one.
                // For now, let's assume the filename matches the 'handler' property in config + 'Channel'.
                const handlerName = file.replace('.js', '').toLowerCase();
                handlerClassMap.set(handlerName, HandlerClass);
            } catch (error) {
                console.error(`Error loading channel handler file ${file}:`, error);
            }
        }

        for (const channelConfig of config.channels) {
            if (channelConfig.enabled) {
                const handlerKey = channelConfig.handler.toLowerCase();
                const HandlerClass = handlerClassMap.get(handlerKey);

                if (HandlerClass) {
                    try {
                        const handlerInstance = new HandlerClass(channelConfig.name, channelConfig);
                        handlerInstance.initialize(client);
                        this.handlers.push(handlerInstance);
                        console.log(`Initialized channel handler: ${channelConfig.name}`);
                    } catch (e) {
                        console.error(`Error initializing channel handler ${channelConfig.name}:`, e);
                    }
                } else {
                    console.error(`Channel handler "${channelConfig.handler}" is enabled in config, but no matching class was found for key "${handlerKey}".`);
                }
            }
        }
    }

    /**
     * Dispatches a message to all loaded channel handlers.
     * @param {import('discord.js').Message} message 
     * @param {object} state 
     * @param {object} configObj 
     */
    async handleMessage(message, state, configObj) {
        for (const handler of this.handlers) {
            const handled = await handler.handle(message, state, configObj);
            if (handled) {
                break;
            }
        }
    }
}

module.exports = new ChannelManager();