const cheerio = require('cheerio');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const { sanitizeMarkdown } = require('../utils/formatters');
const logger = require('../utils/logger');

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
        const $ = cheerio.load(data, { scriptingEnabled: false });
        try {
            const parsedData = {};
            const keywords = this.config.keywords || [];

            $('.features').each((_, section) => {
                const featureNameElement = $(section).find('h2');
                if (featureNameElement.length === 0) return;
                const featureName = featureNameElement.text().trim();
                const featureId = $(section).attr('id');

                const regions = [];
                $(section).find('li').each((_, li) => {
                    const region = $(li).text().trim();
                    if (keywords.some(keyword => region.toLowerCase().includes(keyword))) {
                        regions.push(region);
                    }
                });

                if (regions.length > 0) {
                    parsedData[featureName] = { regions, id: featureId };
                }
            });
            return parsedData;
        } catch (error) {
            logger.error('Error parsing Apple Features:', error);
            return {};
        }
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
     * @returns {Promise<void>}
     */
    async notify(changes) {
        const channel = this.getNotificationChannel();
        if (!channel) {
            logger.error('Notification channel not found for %s.', this.name);
            return;
        }
        
        const url = this.config.url;
        const notificationConfigs = [
            { key: 'added', titlePlural: '🌟 ¡{count} nuevas funciones de Apple disponibles! 🐸', titleSingular: '🌟 ¡Nueva función de Apple disponible! 🐸', color: '#0071E3', logSuffix: 'found' },
            { key: 'removed', titlePlural: '🚫 ¡{count} funciones de Apple eliminadas! 🐸', titleSingular: '🚫 ¡Función de Apple eliminada! 🐸', color: '#F44336', logSuffix: 'removed' }
        ];

        const notificationPromises = [];

        for (const config of notificationConfigs) {
            const items = changes[config.key] || [];
            if (items.length === 0) continue;

            items.forEach(item => {
                logger.info('Apple feature %s: %s in %s', config.logSuffix, item.featureName, item.region);
            });

            // Calculate unique features by name
            const uniqueFeatures = new Set(items.map(i => i.featureName)).size;
            const title = uniqueFeatures > 1 
                ? config.titlePlural.replace('{count}', uniqueFeatures) 
                : config.titleSingular;

            const embed = new Discord.EmbedBuilder()
                .setTitle(title)
                .setColor(config.color);

            if (items.length <= 3) {
                // Detailed view for small updates
                items.forEach(item => {
                    const encodedUrl = encodeURI(`${url}#${item.id}`);
                    const fixedPartLength = '📍 \n🔗 '.length + encodedUrl.length;
                    const budget = 1024 - fixedPartLength;
                    
                    let sanitizedRegion = sanitizeMarkdown(item.region);
                    if (sanitizedRegion.length > budget) {
                        sanitizedRegion = sanitizedRegion.substring(0, budget - 3) + '...';
                    }

                    embed.addFields([{
                        name: `✨ ${sanitizeMarkdown(item.featureName).substring(0, 253)}`,
                        value: `📍 ${sanitizedRegion}\n🔗 ${encodedUrl}`,
                        inline: false
                    }]);
                });
            } else {
                // Digest view for large updates
                const allRegions = new Set();
                const categories = Object.create(null);
                
                items.forEach(item => {
                    allRegions.add(item.region);
                    const separatorIndex = item.featureName.indexOf(':');
                    const category = separatorIndex === -1 
                        ? 'Otras' 
                        : item.featureName.slice(0, separatorIndex).trim();
                    const subFeature = separatorIndex === -1 
                        ? item.featureName.trim() 
                        : item.featureName.slice(separatorIndex + 1).trim() || category;
                    
                    if (!categories[category]) categories[category] = new Set();
                    categories[category].add(subFeature);
                });

                const regionsText = Array.from(allRegions).map(r => `**${sanitizeMarkdown(r)}**`).join(', ');
                const isAdded = config.key === 'added';
                
                let description = isAdded 
                    ? `Se han detectado nuevas funciones para: ${regionsText}\n\n**Novedades por categoría:**\n`
                    : `Se han eliminado funciones para: ${regionsText}\n\n**Cambios por categoría:**\n`;

                for (const [category, features] of Object.entries(categories)) {
                    const featureList = Array.from(features);
                    const featuresText = featureList.map(f => sanitizeMarkdown(f)).join(', ');
                    description += `- **${sanitizeMarkdown(category)}** (${featureList.length}): ${featuresText}\n`;
                }

                const linkSuffix = `\n🔗 [Ver lista completa en Apple.com](${url})`;
                
                // Enforce Discord 4096 char limit safely without cutting the link
                if (description.length + linkSuffix.length > 4096) {
                    const maxDescLength = 4096 - linkSuffix.length - 3; // 3 for '...'
                    description = description.substring(0, maxDescLength) + '...';
                }
                
                description += linkSuffix;
                
                embed.setDescription(description);
            }

            notificationPromises.push(channel.send({ embeds: [embed] }));
        }

        await Promise.all(notificationPromises);
    }
}

module.exports = AppleFeatureMonitor;
