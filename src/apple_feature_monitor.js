/**
 * @file This module is responsible for monitoring Apple's feature availability page
 * for new features in specific regions.
 * @module apple_feature_monitor
 */

const got = require('got');
const { JSDOM } = require('jsdom');
const fs = require('fs-extra');
const Discord = require('discord.js');

const APPLE_FEATURE_URL = 'https://www.apple.com/ios/feature-availability/';
const FEATURES_FILE = './src/apple_features.json';
let monitoredFeatures = {};

/**
 * Initializes the monitor by loading the last known features from a local JSON file.
 * If the file does not exist, it starts with an empty list of features.
 * @async
 */
async function initialize() {
    try {
        const data = await fs.readJSON(FEATURES_FILE);
        monitoredFeatures = typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {};
    } catch (err) {
        console.log(`Cannot read ${FEATURES_FILE}, starting fresh.`);
        monitoredFeatures = {};
    }
}

/**
 * Fetches the latest feature data from Apple's page,
 * compares it against the stored data, and triggers notifications on changes.
 * @param {Discord.Client} client The active Discord client instance.
 * @async
 */
async function check(client) {
    console.log('Checking for new Apple features...');
    try {
        const response = await got(APPLE_FEATURE_URL);
        const dom = new JSDOM(response.body);
        const sections = dom.window.document.querySelectorAll('.features');

        const currentFeatures = {};
        const keywords = ['chile', 'spanish (latin america)', 'scl'];

        // 1. Parse the website
        sections.forEach(section => {
            const featureNameElement = section.querySelector('h2');
            if (!featureNameElement) return;
            const featureName = featureNameElement.textContent.trim();
            const featureId = section.id;
            
            const regions = [];
            const listItems = section.querySelectorAll('li');
            listItems.forEach(li => {
                const region = li.textContent.trim();
                if (keywords.some(keyword => region.toLowerCase().includes(keyword))) {
                    regions.push(region);
                }
            });

            if (regions.length > 0) {
                currentFeatures[featureName] = { regions, id: featureId };
            }
        });

        // 2. Compare with monitored features and collect all changes into an array
        const changesDetected = [];

        for (const feature in currentFeatures) {
            if (!monitoredFeatures[feature]) {
                // New feature found
                currentFeatures[feature].regions.forEach(region => {
                    changesDetected.push({
                        feature: feature,
                        region: region,
                        anchor: currentFeatures[feature].id
                    });
                });
            } else {
                // Existing feature, check for new regions
                const monitored = monitoredFeatures[feature];
                // Handle both old (array) and new (object) data structures for backward compatibility.
                const monitoredRegions = Array.isArray(monitored) ? monitored : monitored.regions;

                currentFeatures[feature].regions.forEach(region => {
                    if (!monitoredRegions.includes(region)) {
                        changesDetected.push({
                            feature: feature,
                            region: region,
                            anchor: currentFeatures[feature].id
                        });
                    }
                });
            }
        }

        // 3. Process Notifications (Rate Limited)
        if (changesDetected.length > 0) {
            console.log(`Found ${changesDetected.length} changes.`);
            
            // Save state immediately
            monitoredFeatures = currentFeatures;
            await fs.outputJSON(FEATURES_FILE, monitoredFeatures, { spaces: 2 });

            const NOTIFICATION_LIMIT = 5;
            const individualUpdates = changesDetected.slice(0, NOTIFICATION_LIMIT);
            const groupedUpdates = changesDetected.slice(NOTIFICATION_LIMIT);

            // Send individual notifications for the first 10
            for (const change of individualUpdates) {
                notify(change.feature, change.region, change.anchor, client);
            }

            // Send summary notification for the rest
            if (groupedUpdates.length > 0) {
                notifySummary(groupedUpdates, client);
            }
        }
        
    } catch (err) {
        console.error('Error checking for Apple features:', err);
    }
}

/**
 * Sends a notification to a Discord channel about a new feature.
 * @param {string} feature The name of the new feature.
 * @param {string} region The region where the feature is now available.
 * @param {string} anchor The anchor ID for the feature on the page.
 * @param {Discord.Client} client The active Discord client instance.
 */
function notify(feature, region, anchor, client) {
    console.log(`New Apple feature found: ${feature} in ${region}`);
    const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
    if (channel) {
        const url = `${APPLE_FEATURE_URL}#${anchor}`;
        const embed = new Discord.MessageEmbed();
        embed.setTitle(`🌟 ¡Nueva función de Apple disponible!`);
        embed.addField('Función', feature);
        embed.addField('Región/Idioma', region);
        embed.addField('URL', url);
        embed.setColor('#0071E3');
        channel.send(embed);
    }
}

/**
 * Sends a summary notification for excess changes.
 * @param {Array} changes List of change objects {feature, region, anchor}
 * @param {Discord.Client} client The active Discord client instance.
 */
function notifySummary(changes, client) {
    console.log(`Summarizing ${changes.length} additional changes.`);
    const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
    if (channel) {
        const embed = new Discord.MessageEmbed();
        embed.setTitle(`...y ${changes.length} actualizaciones más`);
        
        // Build a list string. Note: Discord fields have a 1024 char limit.
        // We map to "• Feature Name (Region)" format
        let description = changes.map(c => `• **${c.feature}** (${c.region})`).join('\n');

        // Simple truncation check to avoid API errors if the list is massive
        if (description.length > 4090) {
            description = description.substring(0, 4000) + '...\n(Lista truncada)';
        }

        embed.setDescription(description);
        embed.setColor('#0071E3');
        embed.setFooter(`Total detectado en este ciclo: ${changes.length + 10}`);
        
        channel.send(embed);
    }
}

module.exports = {
    initialize,
    check
};