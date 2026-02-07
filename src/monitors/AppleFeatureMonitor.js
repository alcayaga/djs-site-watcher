const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const { sanitizeMarkdown } = require('../utils/formatters');

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
     * @returns {{added: Array, removed: Array}|null} An object with arrays of new and removed features/regions, or null if no changes.
     */
    compare(newData) {
        const added = [];
        const removed = [];
        const oldFeatures = this.state || {};

        // Detect additions
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

        // Detect removals
        for (const featureName in oldFeatures) {
            const oldFeature = oldFeatures[featureName];
            const newFeature = newData[featureName];

            if (!newFeature) {
                // Feature removed entirely
                oldFeature.regions.forEach(region => {
                    removed.push({ featureName, region, id: oldFeature.id });
                });
            } else {
                // Existing feature, check for removed regions
                const newRegions = newFeature.regions || [];
                oldFeature.regions.forEach(region => {
                    if (!newRegions.includes(region)) {
                        removed.push({ featureName, region, id: oldFeature.id });
                    }
                });
            }
        }

        if (added.length > 0 || removed.length > 0) {
            return { added, removed };
        }

        return null;
    }

    /**
     * Sends notifications for new features or regions.
     * @param {{added: Array, removed: Array}} changes The changes to notify about.
     */
    notify(changes) {
        const channel = this.getNotificationChannel();
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }
        
        const url = this.config.url;
        const notificationConfigs = [
            { key: 'added', title: '🌟 ¡Nueva función de Apple disponible! 🐸', color: '#0071E3', logSuffix: 'found' },
            { key: 'removed', title: '🚫 ¡Función de Apple eliminada! 🐸', color: '#F44336', logSuffix: 'removed' }
        ];

        notificationConfigs.forEach(config => {
            (changes[config.key] || []).forEach(item => {
                console.log(`Apple feature ${config.logSuffix}: ${item.featureName} in ${item.region}`);
                const embed = new Discord.EmbedBuilder()
                    .setTitle(config.title)
                    .addFields([
                        { name: '✨ Función', value: sanitizeMarkdown(item.featureName), inline: true },
                        { name: '📍 Región/Idioma', value: sanitizeMarkdown(item.region), inline: true },
                        { name: '🔗 URL', value: encodeURI(`${url}#${item.id}`) }
                    ])
                    .setColor(config.color);
                channel.send({ embeds: [embed] });
            });
        });
    }
}

module.exports = AppleFeatureMonitor;
