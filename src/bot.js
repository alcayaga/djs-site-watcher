// Import required modules
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

const interactionHandler = require('./handlers/interactionHandler');
const messageHandler = require('./handlers/messageHandler');
const channelManager = require('./ChannelManager');
const monitorManager = require('./MonitorManager');
const fs = require('fs');
const path = require('path');

// Load configuration and state
const storage = require('./storage');
storage.migrateLegacyData();

const config = require('./config');
const state = require('./state');


//
// Discord client events
//

// When the client is ready, run this code
client.on(Events.ClientReady, async () => {
    // Load the state from storage
    state.load();

    // Initialize channel handlers
    channelManager.initialize(client);

    // Note: Slash commands are deployed via src/deploy-commands.js
    // You can uncomment the following lines to deploy on startup, but it's recommended to run the script manually.
    /*
    const { loadCommands } = require('./utils/commandLoader');
    const commands = loadCommands();
    try {
        console.log(`[${client.user.tag}] Started refreshing application (/) commands.`);
        await client.application.commands.set(commands.map(c => c.data.toJSON()));
        console.log(`[${client.user.tag}] Successfully reloaded application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
    */

    // Initialize the trigger_regex for each response
    for (const response of state.responses) {
        response.trigger_regex = new RegExp(response.trigger, 'i');
    }

    // Dynamically load all monitor classes
    const monitorClasses = [];
    const monitorFiles = fs.readdirSync(path.join(__dirname, 'monitors'))
        .filter(file => file.endsWith('.js'));

    for (const file of monitorFiles) {
        const MonitorClass = require(`./monitors/${file}`);
        monitorClasses.push(MonitorClass);
    }

    // Initialize the MonitorManager and all configured monitors
    await monitorManager.initialize(client, monitorClasses);

    // If SINGLE_RUN is true, run the monitors once and then exit
    if (String(config.SINGLE_RUN).toLowerCase() === 'true') {
        console.log('DEBUG / SINGLE RUN MODE ENABLED');
        await monitorManager.checkAll();
        if (process.env.NODE_ENV !== 'test') {
            setTimeout(() => {
                process.exit();
            }, 5000);
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

    console.log(`[${client.user.tag}] Ready...\n[${client.user.tag}] Running an interval of ${config.interval} minute(s).`);
});

// Handle interactions (Slash Commands, Autocomplete)
client.on(Events.InteractionCreate, async interaction => {
    await interactionHandler.handleInteraction(interaction, client, state, config, monitorManager);
});

// When a message is sent, run this code (Auto-responses only)
client.on(Events.MessageCreate, message => {
    messageHandler.handleMessage(message, state, config);
});

// Login to Discord with your client's token
if (require.main === module) {
    client.login(config.DISCORDJS_BOT_TOKEN);
}

module.exports = { client };