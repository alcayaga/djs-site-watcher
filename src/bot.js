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
const carrierMonitor = require('./carrier_monitor.js');
const appleFeatureMonitor = require('./apple_feature_monitor.js');
const applePayMonitor = require('./apple_pay_monitor.js');
const appleEsimMonitor = require('./apple_esim_monitor.js');
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

// Cron job for carrier monitoring
const carrierCron = new CronJob(`0 */${config.interval} * * * *`, () => {
    carrierMonitor.check(client);
}, null, false);

// Cron job for Apple feature monitoring
const appleFeatureCron = new CronJob(`0 */${config.interval} * * * *`, () => {
    appleFeatureMonitor.check(client);
}, null, false);

// Cron job for Apple Pay monitoring
const applePayCron = new CronJob(`0 */${config.interval} * * * *`, () => {
    applePayMonitor.check(client);
}, null, false);

// Cron job for Apple eSIM monitoring
const appleEsimCron = new CronJob(`0 */${config.interval} * * * *`, () => {
    appleEsimMonitor.check(client);
}, null, false);

//
// Discord client events
//

// When the client is ready, run this code
client.on('ready', () => {
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

    // Initialize the monitors
    carrierMonitor.initialize(client);
    appleFeatureMonitor.initialize(client);
    applePayMonitor.initialize(client);
    appleEsimMonitor.initialize(client);

    // If SINGLE_RUN is true, run the monitors once and then exit
    if (config.SINGLE_RUN === 'true') {
        console.log('DEBUG / SINGLE RUN MODE ENABLED');
        siteMonitor.checkSites(client, state.sitesToMonitor, client.channels.cache.get(config.DISCORDJS_TEXTCHANNEL_ID));
        carrierMonitor.check(client).then(() => {
            appleFeatureMonitor.check(client).then(() => {
                applePayMonitor.check(client).then(() => {
                    appleEsimMonitor.check(client).then(() => {
                        setTimeout(() => {
                            process.exit();
                        }, 5000);
                    });
                });
            });
        });
        return;
    }

    // Set the cron time based on the interval
    if (config.interval < 60) {
        cronUpdate.setTime(new CronTime(`0 */${config.interval} * * * *`));
        carrierCron.setTime(new CronTime(`0 */${config.interval} * * * *`));
        appleFeatureCron.setTime(new CronTime(`0 */${config.interval} * * * *`));
        applePayCron.setTime(new CronTime(`0 */${config.interval} * * * *`));
        appleEsimCron.setTime(new CronTime(`0 */${config.interval} * * * *`));
    } else {
        cronUpdate.setTime(new CronTime(`0 0 * * * *`));
        carrierCron.setTime(new CronTime(`0 0 * * * *`));
        appleFeatureCron.setTime(new CronTime(`0 0 * * * *`));
        applePayCron.setTime(new CronTime(`0 0 * * * *`));
        appleEsimCron.setTime(new CronTime(`0 0 * * * *`));
    }

    // Start the cron jobs
    cronUpdate.start();
    carrierCron.start();
    appleFeatureCron.start();
    applePayCron.start();
    appleEsimCron.start();

    console.log(`[${client.user.tag}] Ready...\n[${client.user.tag}] Running an interval of ${config.interval} minute(s).`);
});

// When a message is sent, run this code
client.on('message', message => {
    commandHandler.handleCommand(message, client, state, config, cronUpdate, carrierCron, appleFeatureCron, applePayCron, appleEsimCron);
});

// Login to Discord with your client's token
if (require.main === module) {
    client.login(config.DISCORDJS_BOT_TOKEN);
}

