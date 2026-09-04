const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const DealMonitor = require('../src/monitors/DealMonitor');
const solotodo = require('../src/utils/solotodo');
const config = require('../src/config');
const channelManager = require('../src/ChannelManager');
const logger = require('../src/utils/logger');

// Ensure we have a scenario argument
const scenarioName = process.argv[2];
if (!scenarioName) {
    console.error('Usage: node scripts/simulate.js <scenario-name>');
    console.error('Example: node scripts/simulate.js deal-tie');
    process.exit(1);
}

const scenarioPath = path.join(__dirname, 'scenarios', `${scenarioName}.js`);
let scenario;
try {
    scenario = require(scenarioPath);
} catch (error) {
    console.error(`Failed to load scenario '${scenarioName}' from ${scenarioPath}`);
    console.error(error.message);
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
});

async function runSimulation() {
    logger.info(`Starting simulation: ${scenarioName}`);
    
    const originalGetStores = solotodo.getStores;
    const originalGetAvailableEntities = solotodo.getAvailableEntities;

    try {
        // Apply scenario mocks
        solotodo.getStores = async () => scenario.mockStores;
        solotodo.getAvailableEntities = async () => scenario.mockEntities;

        // Initialize ChannelManager
        await channelManager.initialize(client);

        const monitorConfig = {
            name: 'Deal',
            enabled: true,
            interval: '* * * * * *',
            file: './config/deals.json',
        };
        
        const monitor = new DealMonitor('Deal', monitorConfig);
        await monitor.initialize(client);
        
        // Cache the Deals channel
        const dealsChannelConfig = config.channels.find(c => c.handler === 'DealsChannel');
        if (dealsChannelConfig && dealsChannelConfig.channelId) {
            logger.info(`Fetching channel from Discord API: ${dealsChannelConfig.channelId}`);
            await client.channels.fetch(dealsChannelConfig.channelId);
            monitor.config.channelId = dealsChannelConfig.channelId;
        }
        
        const channel = monitor.getNotificationChannel();
        if (!channel) {
            logger.error('Channel could not be resolved! Notification will not send.');
            return;
        }

        logger.info('Triggering notify() on DealMonitor...');
        
        await monitor.notify({ 
            product: scenario.product, 
            triggers: scenario.triggers, 
            date: new Date().toISOString(), 
            stored: scenario.stored, 
            previousOfferPrice: scenario.previousOfferPrice, 
            previousNormalPrice: scenario.previousNormalPrice 
        });

        logger.info('Notification sent successfully!');
    } finally {
        // Restore original functions
        solotodo.getStores = originalGetStores;
        solotodo.getAvailableEntities = originalGetAvailableEntities;
        
        // Clean teardown
        logger.info('Destroying Discord client connection...');
        client.destroy();
    }
}

client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    try {
        await runSimulation();
    } catch (e) {
        logger.error('Simulation failed:', e);
        client.destroy();
    }
});

if (!config.DISCORDJS_BOT_TOKEN) {
    logger.error('DISCORDJS_BOT_TOKEN is missing! Are you running with --env-file=.env ?');
    process.exit(1);
}

client.login(config.DISCORDJS_BOT_TOKEN);
