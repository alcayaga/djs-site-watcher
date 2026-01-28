// Load environment variables
require('dotenv').config();

// Import required modules
const Discord = require('discord.js');
const client = new Discord.Client();
const storage = require('./storage');
const commandHandler = require('./command-handler');
const monitorManager = require('./MonitorManager'); // Import MonitorManager
const { CronTime } = require('cron');

// Load configuration and state
const config = require('./config');
const state = require('./state');


//
// Discord client events
//

// When the client is ready, run this code
client.on('ready', async () => { // Made async to await monitorManager.initialize
    // Load the state from storage
    state.load();

    // Initialize the trigger_regex for each response
    for (const response of state.responses) {
        response.trigger_regex = new RegExp(response.trigger, 'i');
    }

    // Initialize the MonitorManager and all configured monitors
    await monitorManager.initialize(client);

    // If SINGLE_RUN is true, run the monitors once and then exit
    if (config.SINGLE_RUN === 'true') {
        console.log('DEBUG / SINGLE RUN MODE ENABLED');
        await monitorManager.checkAll(client); // Use MonitorManager to check all monitors
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
client.on('message', message => {
    commandHandler.handleCommand(message, client, state, config, null, monitorManager); // Pass null for cronUpdate
});

// Login to Discord with your client's token
if (require.main === module) {
    client.login(config.DISCORDJS_BOT_TOKEN);
}

