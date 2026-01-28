// Load environment variables
require('dotenv').config();

// Import required modules
const got = require('got');
const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const client = new Discord.Client();
const storage = require('./storage');
const commandHandler = require('./command-handler');
const siteMonitor = require('./site-monitor');
const monitorManager = require('./MonitorManager'); // Import MonitorManager
const { CronJob, CronTime } = require('cron');

// Load configuration and state
const config = require('./config');
const state = require('./state');

//
// Cron jobs for monitoring
//

// Cron job for website monitoring
const cronUpdate = new CronJob(`0 */${config.interval} * * * *`, () => {
    const time = new Date();
    console.log(`Cron executed at ${time.toLocaleString()}`);
    siteMonitor.checkSites(client, state.sitesToMonitor, client.channels.cache.get(config.DISCORDJS_TEXTCHANNEL_ID));
}, null, false);


//
// Discord client events
//

// When the client is ready, run this code
client.on('ready', async () => { // Made async to await monitorManager.initialize
    // Load the state from storage
    state.load();

    // Initialize the lastContent for each site if it's not already set
    for (const site of state.sitesToMonitor) {
        if (!site.lastContent) {
            const { url, css } = site;
            got(url).then(response => {
                const dom = new JSDOM(response.body);
                let content = '';
                if (css) {
                    const selector = dom.window.document.querySelector(css);
                    content = selector ? selector.textContent : '';
                } else {
                    content = dom.window.document.querySelector('head').textContent;
                }
                site.lastContent = content;
                storage.saveSites(state.sitesToMonitor);
            }).catch(err => {
                console.log(`Error initializing lastContent for ${url}: ${err}`);
            });
        }
    }

    // Initialize the trigger_regex for each response
    for (const response of state.responses) {
        response.trigger_regex = new RegExp(response.trigger, 'i');
    }

    // Initialize the MonitorManager and all configured monitors
    await monitorManager.initialize(client);

    // If SINGLE_RUN is true, run the monitors once and then exit
    if (config.SINGLE_RUN === 'true') {
        console.log('DEBUG / SINGLE RUN MODE ENABLED');
        siteMonitor.checkSites(client, state.sitesToMonitor, client.channels.cache.get(config.DISCORDJS_TEXTCHANNEL_ID));
        await monitorManager.checkAll(client); // Use MonitorManager to check all monitors
        if (process.env.NODE_ENV !== 'test') {
            setTimeout(() => {
                process.exit();
            }, 5000);
        }
        return;
    }

    // Set the cron time based on the interval
    if (config.interval < 60) {
        cronUpdate.setTime(new CronTime(`0 */${config.interval} * * * *`));
        monitorManager.setAllIntervals(config.interval); // Use MonitorManager to set all monitor intervals
    } else {
        cronUpdate.setTime(new CronTime(`0 0 * * * *`));
        monitorManager.setAllIntervals(60); // Use MonitorManager to set all monitor intervals
    }

    // Start the cron jobs
    cronUpdate.start();
    monitorManager.startAll(); // Use MonitorManager to start all monitors

    console.log(`[${client.user.tag}] Ready...\n[${client.user.tag}] Running an interval of ${config.interval} minute(s).`);
});

// When a message is sent, run this code
client.on('message', message => {
    commandHandler.handleCommand(message, client, state, config, cronUpdate, monitorManager); // Pass monitorManager
});

// Login to Discord with your client's token
if (require.main === module) {
    client.login(config.DISCORDJS_BOT_TOKEN);
}

