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
        // Map<string, ChannelHandler[]> where key is channelId
        this.handlers = new Map();
    }

    /**
     * Dynamically loads and initializes all channel handlers based on config.
     * @param {import('discord.js').Client} client The Discord client instance.
     */
    async initialize(client) {
        const channelsPath = path.join(__dirname, 'channels');
        let handlerFiles;
        try {
            handlerFiles = (await fs.promises.readdir(channelsPath)).filter(file => file.endsWith('.js'));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return;
            }
            console.error(`Error reading channel handlers directory '${channelsPath}':`, error);
            return;
        }

        const handlerClassMap = new Map();

        for (const file of handlerFiles) {
            try {
                const HandlerClass = require(path.join(channelsPath, file));
                // Assumes the filename (e.g., "QAChannel.js") matches the 'handler' property in the config (e.g., "QAChannel").
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

                        const channelId = channelConfig.channelId;
                        if (channelId) {
                            if (!this.handlers.has(channelId)) {
                                this.handlers.set(channelId, []);
                            }
                            this.handlers.get(channelId).push(handlerInstance);
                        } else {
                            console.warn(`Channel handler ${channelConfig.name} is enabled but missing 'channelId'. It will not receive messages.`);
                        }
                        
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
     * Dispatches a message to the appropriate channel handlers.
     * @param {import('discord.js').Message} message 
     * @param {object} state 
     */
    async handleMessage(message, state) {
        const channelHandlers = this.handlers.get(message.channel.id);
        
        if (channelHandlers) {
            for (const handler of channelHandlers) {
                const handled = await handler.handle(message, state);
                if (handled) {
                    break;
                }
            }
        }
    }
}

module.exports = new ChannelManager();
