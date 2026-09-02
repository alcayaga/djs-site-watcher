// Load configuration and environment as early as possible
const config = require('./config');

// Import required modules
const { CronJob } = require('cron');
const got = require('got');
const { getSafeGotOptions } = require('./utils/network');
const { Client, GatewayIntentBits, Partials, Events, Options } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 20,
        UserManager: 50,
        GuildMemberManager: {
            maxSize: 50,
            keepOverLimit: member => member.id === client.user?.id,
        },
        ThreadManager: 10,
    }),
});

const interactionHandler = require('./handlers/interactionHandler');
const messageHandler = require('./handlers/messageHandler');
const channelManager = require('./ChannelManager');
const monitorManager = require('./MonitorManager');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// Load configuration and state
const storage = require('./storage');
storage.migrateLegacyData();
storage.ensureConfigFiles();

const state = require('./state');


//
// Discord client events
//

// When the client is ready, run this code
client.on(Events.ClientReady, async () => {
    // Load the state from storage
    state.load();

    // Initialize channel handlers
    await channelManager.initialize(client);

    // Note: Slash commands are deployed via src/deploy-commands.js
    // You can uncomment the following lines to deploy on startup, but it's recommended to run the script manually.
    /*
    const { loadCommands } = require('./utils/commandLoader');
    const commands = loadCommands();
    try {
        logger.info('[%s] Started refreshing application (/) commands.', client.user.tag);
        await client.application.commands.set(commands.map(c => c.data.toJSON()));
        logger.info('[%s] Successfully reloaded application (/) commands.', client.user.tag);
    } catch (error) {
        logger.error('Error refreshing application commands:', error);
    }
    */

    // Initialize the trigger_regex for each response
    for (const response of state.responses) {
        response.trigger_regex = new RegExp(response.trigger, 'i');
    }

    // Dynamically load all monitor classes
    const monitorClasses = [];
    const monitorPath = path.join(__dirname, 'monitors');
    let monitorFiles = [];
    try {
        monitorFiles = (await fs.promises.readdir(monitorPath))
            .filter(file => file.endsWith('.js'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('Monitors directory not found at "%s". No monitors will be loaded.', monitorPath);
        } else {
            logger.error('Error reading monitors directory at "%s":', monitorPath, error);
        }
    }

    for (const file of monitorFiles) {
        const MonitorClass = require(`./monitors/${file}`);
        monitorClasses.push(MonitorClass);
    }

    // Initialize the MonitorManager and all configured monitors
    await monitorManager.initialize(client, monitorClasses);

    // If SINGLE_RUN is true, run the monitors once and then exit
    if (String(config.SINGLE_RUN).toLowerCase() === 'true') {
        logger.info('DEBUG / SINGLE RUN MODE ENABLED');
        await monitorManager.checkAll();
        if (process.env.NODE_ENV !== 'test') {
            process.exit();
        }
        return;
    }

    // Set the cron time based on the interval
    if (config.interval) {
        const interval = parseInt(config.interval, 10);
        if (!isNaN(interval)) {
            monitorManager.setAllIntervals(interval);
        }
    }
    
    // Start the cron jobs
    monitorManager.startAll();

    // Setup Uptime Kuma Heartbeat
    if (config.uptimeKumaUrl) {
        /**
         * We do a background ping to the configured Uptime Kuma Push URL on the same schedule
         * as the monitors. This acts as a heartbeat to prove the bot process is alive.
         */
        /**
         * Pings the configured Uptime Kuma Push URL to report the bot is alive.
         * @returns {Promise<void>}
         */
        const pingUptimeKuma = async () => {
            try {
                await got(config.uptimeKumaUrl, getSafeGotOptions());
                logger.info('Pinged Uptime Kuma heartbeat URL successfully.');
            } catch (error) {
                logger.error('Failed to ping Uptime Kuma:', error.message);
            }
        };

        const parsedInterval = parseInt(config.interval, 10);
        const interval = (!isNaN(parsedInterval) && parsedInterval > 0) ? parsedInterval : 5;
        
        const uptimeCronJob = new CronJob(`0 */${interval} * * * *`, pingUptimeKuma);
        uptimeCronJob.start();
        logger.info('Uptime Kuma reporting enabled with interval %d.', interval);
    }

    logger.info('[%s] Ready...', client.user.tag);
    logger.info('[%s] Running an interval of %d minute(s).', client.user.tag, config.interval);
});

// Handle interactions (Slash Commands, Autocomplete)
client.on(Events.InteractionCreate, async interaction => {
    await interactionHandler.handleInteraction(interaction, client, state, config, monitorManager);
});

// When a message is sent, run this code (Auto-responses only)
client.on(Events.MessageCreate, message => {
    messageHandler.handleMessage(message, state).catch(error => {
        console.error(`Error handling message ${message.id} in channel ${message.channel.id}:`, error);
    });
});

// Login to Discord with your client's token
if (require.main === module) {
    client.login(config.DISCORDJS_BOT_TOKEN);
}

module.exports = { client };