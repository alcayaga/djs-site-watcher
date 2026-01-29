const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');

/**
 * Monitor for Apple Feature availability in various regions.
 * Extends the base Monitor class to provide specific logic for parsing, comparing, and notifying about new features or regions.
 */
class AppleFeatureMonitor extends Monitor {
    /**
     * Parses the HTML content to extract feature availability for configured keywords.
     * @param {string} data The HTML content of the page.
     * @returns {object} The parsed feature data.
     */
    parse(data) {
        const dom = new JSDOM(data);
        const sections = dom.window.document.querySelectorAll('.features');
        const parsedData = {};
        const keywords = this.config.keywords || [];

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
                parsedData[featureName] = { regions, id: featureId };
            }
        });
        return parsedData;
    }

    /**
     * Compares the old state with the new data to find new features or new regions for existing features.
     * @param {object} newData The newly parsed feature data.
     * @returns {{added: Array}|null} An object with an array of new features/regions, or null if no changes.
     */
    compare(newData) {
        const added = [];
        const oldFeatures = this.state || {};

        for (const featureName in newData) {
            const newFeature = newData[featureName];
            const oldFeature = oldFeatures[featureName];

            if (!oldFeature) {
                // New feature
                newFeature.regions.forEach(region => {
                    added.push({ featureName, region, id: newFeature.id });
                });
            } else {
                // Existing feature, check for new regions
                const oldRegions = oldFeature.regions || [];
                newFeature.regions.forEach(region => {
                    if (!oldRegions.includes(region)) {
                        added.push({ featureName, region, id: newFeature.id });
                    }
                });
            }
        }

        if (added.length > 0) {
            return { added };
        }

        return null;
    }
    
    /**
     * Overrides the base saveState to merge new data with old data.
     * @param {object} newState The new state to save.
     */
    async saveState(newState) {
        const mergedState = { ...this.state, ...newState };
        await super.saveState(mergedState);
    }

    /**
     * Sends notifications for new features or regions.
     * @param {Discord.Client} client The Discord client instance.
     * @param {{added: Array}} changes The changes to notify about.
     */
    notify(client, changes) {
        const channel = this.getNotificationChannel(client);
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }
        
        const url = this.config.url;

        changes.added.forEach(item => {
            console.log(`New Apple feature found: ${item.featureName} in ${item.region}`);
            const embed = new Discord.MessageEmbed()
                .setTitle(`🌟 ¡Nueva función de Apple disponible!`)
                .addField('Función', item.featureName)
                .addField('Región/Idioma', item.region)
                .addField('URL', `${url}#${item.id}`)
                .setColor('#0071E3');
            channel.send(embed);
        });
    }
}

module.exports = AppleFeatureMonitor;
