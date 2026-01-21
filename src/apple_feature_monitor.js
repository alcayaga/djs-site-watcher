/**
 * This module is responsible for monitoring Apple's feature availability page
 * for new features in specific regions.
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
 */
async function initialize() {
    try {
        monitoredFeatures = await fs.readJSON(FEATURES_FILE);
    } catch (err) {
        console.log(`Cannot read ${FEATURES_FILE}, starting fresh.`);
        monitoredFeatures = {};
    }
}

/**
 * Fetches the latest feature data from Apple's page,
 * compares it against the stored data, and triggers notifications on changes.
 * @param {Discord.Client} client The active Discord client instance.
 */
async function check(client) {
    console.log('Checking for new Apple features...');
    try {
        const response = await got(APPLE_FEATURE_URL);
        const dom = new JSDOM(response.body);
        const sections = dom.window.document.querySelectorAll('.features');

        const currentFeatures = {};
        const keywords = ['chile', 'spanish (latin america)', 'scl'];

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

        // Compare with monitored features and notify if there are changes
        let hasChanges = false;
        for (const feature in currentFeatures) {
            if (!monitoredFeatures[feature]) {
                // New feature
                currentFeatures[feature].regions.forEach(region => {
                    notify(feature, region, currentFeatures[feature].id, client);
                });
                hasChanges = true;
            } else {
                // Existing feature, check for new regions
                const monitored = monitoredFeatures[feature];
                // Handle both old (array) and new (object) data structures for backward compatibility.
                const monitoredRegions = Array.isArray(monitored) ? monitored : monitored.regions;

                currentFeatures[feature].regions.forEach(region => {
                    if (!monitoredRegions.includes(region)) {
                        notify(feature, region, currentFeatures[feature].id, client);
                        hasChanges = true;
                    }
                });
            }
        }

        if (hasChanges) {
            monitoredFeatures = currentFeatures;
            await fs.outputJSON(FEATURES_FILE, monitoredFeatures, { spaces: 2 });
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

module.exports = {
    initialize,
    check
};
