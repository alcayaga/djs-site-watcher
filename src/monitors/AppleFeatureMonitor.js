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

            // Support nested .features .section-content, falling back to legacy formats
            const containerSelector = $('.features .section-content').length > 0
                ? '.features .section-content'
                : $('.features').length > 0
                    ? '.features'
                    : '.section-content';

            $(containerSelector).each((_, section) => {
                const heading = $(section).find('h2, h3, h4').first();
                if (heading.length === 0) return;
                
                const featureName = heading.text().replace(/\s+/g, ' ').trim();
                if (!featureName || featureName === 'Apple Footer' || featureName === 'Shop and Learn') return;
                
                const featureId = $(section).attr('id') || heading.attr('id') || $(section).parent().attr('id');

                const regions = [];
                $(section).find('li').each((_, li) => {
                    const region = $(li).text().replace(/\s+/g, ' ').trim();
                    if (keywords.length === 0 || keywords.some(keyword => region.toLowerCase().includes(keyword.toLowerCase()))) {
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
    async check() {
        if (this.isMigrationPending) {
            logger.info('Migration is pending for %s. Retrying loadState...', this.name);
            this.state = await this.loadState();
        }
        await super.check();
    }

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

        if (this.isMigrationPending) {
            logger.info('Migration is pending for %s. Skipping comparison and state save to allow retry.', this.name);
            return null;
        }

        if (this.isFreshInstall) {
            logger.info('Fresh install detected for %s. Seeding data silently without notifying.', this.name);
            // Only clear the flag if we actually seeded data, to prevent
            // a temporary parse failure from un-suppressing the next successful run
            if (Object.keys(newData).length > 0) {
                this.isFreshInstall = false;
            }
            return { added: [], removed: [] };
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
                    let encodedUrl = encodeURI(`${url}#${item.id}`);
                    let fixedPartLength = '📍 \n🔗 '.length + encodedUrl.length;
                    
                    // If the URL itself is too long for the field, omit it
                    if (fixedPartLength > 1024) {
                        encodedUrl = '';
                        fixedPartLength = '📍 '.length;
                    }

                    const budget = 1024 - fixedPartLength;
                    
                    let sanitizedRegion = sanitizeMarkdown(item.region);
                    if (sanitizedRegion.length > budget) {
                        if (budget >= 3) {
                            sanitizedRegion = sanitizedRegion.substring(0, budget - 3) + '...';
                        } else {
                            sanitizedRegion = sanitizedRegion.substring(0, budget);
                        }
                    }
                    
                    const value = encodedUrl ? `📍 ${sanitizedRegion}\n🔗 ${encodedUrl}` : `📍 ${sanitizedRegion}`;

                    embed.addFields([{
                        name: `✨ ${sanitizeMarkdown(item.featureName).substring(0, 253)}`,
                        value: value,
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

                let linkSuffix = `\n🔗 [Ver lista completa en Apple.com](${url})`;
                
                if (linkSuffix.length > 4096) {
                    linkSuffix = '';
                }

                // Enforce Discord 4096 char limit safely without cutting the link
                if (description.length + linkSuffix.length > 4096) {
                    const budget = 4096 - linkSuffix.length;
                    if (budget >= 3) {
                        description = description.substring(0, budget - 3) + '...';
                    } else {
                        description = description.substring(0, Math.max(0, budget));
                    }
                }
                
                description += linkSuffix;
                
                embed.setDescription(description);
            }

            notificationPromises.push(channel.send({ embeds: [embed] }));
        }

        await Promise.all(notificationPromises);
    }

    /**
     * Loads the monitor's state from storage.
     * Overridden to provide a migration path from the legacy monolithic apple_features.json
     * @returns {Promise<object>} The loaded state.
     */
    async loadState() {
        const storage = require('../storage');
        const fs = require('fs');
        
        // If it's the iOS monitor, and its target file doesn't exist, try to migrate from the old global file.
        // We restrict this exclusively to iOS because the legacy apple_features.json strictly tracked iOS data.
        // If macOS or watchOS inherited this file, they would immediately flag all iOS features as "removed" and spam the user.
        if (this.name === 'AppleFeature:iOS' && !fs.existsSync(this.config.file) && fs.existsSync('./config/apple_features.json')) {
            logger.info('Migrating legacy apple_features.json to %s', this.config.file);
            this.isMigrationPending = true;
            let legacyState = {};
            try {
                const fsExtra = require('fs-extra');
                const rawLegacyState = await fsExtra.readJSON('./config/apple_features.json');
                for (const key in rawLegacyState) {
                    const normalizedKey = key.replace(/\s+/g, ' ').trim();
                    const newRegions = (rawLegacyState[key].regions || []).map(r => r.replace(/\s+/g, ' ').trim());
                    
                    if (legacyState[normalizedKey]) {
                        const existingRegions = legacyState[normalizedKey].regions;
                        legacyState[normalizedKey].regions = Array.from(new Set([...existingRegions, ...newRegions]));
                    } else {
                        legacyState[normalizedKey] = {
                            id: rawLegacyState[key].id,
                            regions: Array.from(new Set(newRegions))
                        };
                    }
                }
            } catch (err) {
                logger.error('Failed to read legacy apple_features.json during migration: %s', err.message);
                this.isMigrationPending = true;
                return {};
            }
            
            await storage.write(this.config.file, legacyState);
            this.isMigrationPending = false;
            if (Object.keys(legacyState).length === 0) {
                logger.info('Migrated legacy state was empty. Flagging as fresh install.');
                this.isFreshInstall = true;
            } else {
                this.isFreshInstall = false;
            }
            return legacyState;
        }

        const fileExists = fs.existsSync(this.config.file);
        const state = await storage.read(this.config.file);
        
        // Only flag as a fresh install if the state file does not exist at all.
        // If it exists but is empty/corrupt, we want standard processing.
        if (!fileExists) {
            logger.info('Could not find existing state file for %s. Starting fresh.', this.name);
            this.isFreshInstall = true;
        }
        
        // Strictly normalize the loaded state to safeguard against legacy data artifacts.
        // The old parser saved feature names and regions containing non-breaking spaces (\xA0) 
        // directly from Apple's website (e.g. "Apple\xA0Intelligence"). The new parser strictly 
        // normalizes these to standard spaces. If we don't normalize the loaded state here, 
        // compare() will treat the newly parsed standard-spaced features as brand new "additions" 
        // and the old non-breaking space features as "removals", causing massive phantom 
        // notification spam (especially if the bot is run on an unmigrated settings file).
        // We also merge regions for duplicate keys to prevent data loss if two legacy keys 
        // normalize to the exact same string.
        const normalizedState = {};
        for (const key in state) {
            const normalizedKey = key.replace(/\s+/g, ' ').trim();
            const newRegions = (state[key].regions || []).map(r => r.replace(/\s+/g, ' ').trim());
            
            if (normalizedState[normalizedKey]) {
                const existingRegions = normalizedState[normalizedKey].regions;
                normalizedState[normalizedKey].regions = Array.from(new Set([...existingRegions, ...newRegions]));
            } else {
                normalizedState[normalizedKey] = {
                    id: state[key].id,
                    regions: Array.from(new Set(newRegions))
                };
            }
        }
        
        return normalizedState;
    }
}

module.exports = AppleFeatureMonitor;
