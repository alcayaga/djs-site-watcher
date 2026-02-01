// Import required modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});
// const storage = require('./storage'); // Removed
const commandHandler = require('./command-handler');
const monitorManager = require('./MonitorManager');
const fs = require('fs'); // New import
const path = require('path'); // New import

// Load configuration and state
const storage = require('./storage');
storage.migrateLegacyData();

const config = require('./config');
const state = require('./state');


//
// Discord client events
//

// When the client is ready, run this code
client.on('clientReady', async () => {
    // Load the state from storage
    state.load();

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
        // Ensure the class has a 'name' property as expected by MonitorManager
        // e.g., if filename is 'AppleEsimMonitor.js', class name should be 'AppleEsimMonitor'
        // Object.defineProperty(MonitorClass, 'name', { value: path.parse(file).name }); // This line is not needed, as the class name is already the file name.
        monitorClasses.push(MonitorClass);
    }

    // Initialize the MonitorManager and all configured monitors
    await monitorManager.initialize(client, monitorClasses); // Pass monitorClasses

    // If SINGLE_RUN is true, run the monitors once and then exit
    if (String(config.SINGLE_RUN).toLowerCase() === 'true') {
        console.log('DEBUG / SINGLE RUN MODE ENABLED');
        await monitorManager.checkAll(); // Use MonitorManager to check all monitors
        if (process.env.NODE_ENV !== 'test') {
            setTimeout(() => {
                process.exit();
            }, 5000);
        }
        return;
    }

    // Set the cron time based on the interval
    if (config.interval) { // Check if interval is defined
        const interval = parseInt(config.interval, 10);
        if (!isNaN(interval)) {
            monitorManager.setAllIntervals(interval); // Use MonitorManager to set all monitor intervals
        }
    }
    
    // Start the cron jobs
    monitorManager.startAll(); // Use MonitorManager to start all monitors

    console.log(`[${client.user.tag}] Ready...\n[${client.user.tag}] Running an interval of ${config.interval} minute(s).`);
});

// When a message is sent, run this code
client.on('messageCreate', message => {
    commandHandler.handleCommand(message, client, state, config, null, monitorManager); // Pass null for cronUpdate
});

// Login to Discord with your client's token
if (require.main === module) {
    client.login(config.DISCORDJS_BOT_TOKEN);
}

module.exports = { client };

