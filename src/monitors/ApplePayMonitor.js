const Discord = require('discord.js');
const Monitor = require('../Monitor');
const diff = require('diff');
const got = require('got'); // Explicitly import got as it's used directly in fetch
const { getSafeGotOptions } = require('../utils/network');

const { sanitizeMarkdown } = require('../utils/formatters');

/**
 * Monitor for Apple Pay configuration changes, including SupportedRegions and MarketGeos.
 * Extends the base Monitor class to provide specific logic for fetching, parsing, comparing, and notifying about Apple Pay data.
 */
class ApplePayMonitor extends Monitor {
    /**
     * Creates an instance of ApplePayMonitor.
     * @param {string} name The name of the monitor.
     * @param {object} monitorConfig The configuration object for this monitor.
     * @param {string} [monitorConfig.configUrl='https://smp-device-content.apple.com/static/region/v2/config.json'] The URL for the main Apple Pay config.
     * @param {string} [monitorConfig.configAltUrl='https://smp-device-content.apple.com/static/region/v2/config-alt.json'] The URL for the alt Apple Pay config.
     * @param {string} [monitorConfig.region='CL'] The region code to monitor.
     */
    constructor(name, monitorConfig) {
        super(name, monitorConfig);
        this.CONFIG_URL = monitorConfig.configUrl || 'https://smp-device-content.apple.com/static/region/v2/config.json';
        this.CONFIG_ALT_URL = monitorConfig.configAltUrl || 'https://smp-device-content.apple.com/static/region/v2/config-alt.json';
        this.REGION_TO_MONITOR = monitorConfig.region || 'CL';
    }

    /**
     * Fetches data from multiple Apple Pay configuration URLs.
     * Overrides the base fetch method to handle multiple endpoints.
     * @returns {Promise<object>} An object containing the fetched JSON data from all sources.
     */
    async fetch() {
        const fetchedData = {};
        const safeOptions = { responseType: 'json', ...getSafeGotOptions() };

        // Process CONFIG_URL
        try {
            const configResponse = await got(this.CONFIG_URL, safeOptions);
            fetchedData.config = configResponse.body;
            // Fetch MarketGeosURL if available in the main config
            if (fetchedData.config.MarketGeosURL) {
                const marketGeosResponse = await got(fetchedData.config.MarketGeosURL, safeOptions);
                fetchedData.configMarketGeos = marketGeosResponse.body;
            }
        } catch (err) {
            console.error(`Error fetching Apple Pay main config (${this.CONFIG_URL}):`, err);
            fetchedData.config = null;
        }

        // Process CONFIG_ALT_URL
        try {
            const configAltResponse = await got(this.CONFIG_ALT_URL, safeOptions);
            fetchedData.configAlt = configAltResponse.body;
            // Fetch MarketGeosURL if available in the alt config
            if (fetchedData.configAlt.MarketGeosURL) {
                const marketGeosAltResponse = await got(fetchedData.configAlt.MarketGeosURL, safeOptions);
                fetchedData.configAltMarketGeos = marketGeosAltResponse.body;
            }
        } catch (err) {
            console.error(`Error fetching Apple Pay alt config (${this.CONFIG_ALT_URL}):`, err);
            fetchedData.configAlt = null;
        }
        
        return fetchedData;
    }

    /**
     * Parses the fetched raw JSON data into a standardized format for comparison.
     * Extracts SupportedRegions for 'CL' and MarketGeos identifiers.
     * @param {object} rawData The raw data fetched from various Apple Pay endpoints.
     * @returns {object} The parsed and structured data.
     */
    parse(rawData) {
        const parsed = {};

        // Parse main config data
        if (rawData.config) {
            const clRegionData = rawData.config.SupportedRegions ? rawData.config.SupportedRegions[this.REGION_TO_MONITOR] : undefined;
            if (clRegionData) {
                parsed.configRegion = JSON.stringify(clRegionData, null, 2);
            }

            if (rawData.configMarketGeos && rawData.configMarketGeos.MarketGeos) {
                const clMarketGeos = rawData.configMarketGeos.MarketGeos.filter(geo => geo.Region === this.REGION_TO_MONITOR);
                parsed.configMarketGeoIdentifiers = clMarketGeos.map(geo => ({ id: geo.Identifier, name: geo.LocalizedName.en }));
            }
        }

        // Parse alt config data
        if (rawData.configAlt) {
            const clRegionDataAlt = rawData.configAlt.SupportedRegions ? rawData.configAlt.SupportedRegions[this.REGION_TO_MONITOR] : undefined;
            if (clRegionDataAlt) {
                parsed.configAltRegion = JSON.stringify(clRegionDataAlt, null, 2);
            }

            if (rawData.configAltMarketGeos && rawData.configAltMarketGeos.MarketGeos) {
                const clMarketGeosAlt = rawData.configAltMarketGeos.MarketGeos.filter(geo => geo.Region === this.REGION_TO_MONITOR);
                parsed.configAltMarketGeoIdentifiers = clMarketGeosAlt.map(geo => ({ id: geo.Identifier, name: geo.LocalizedName.en }));
            }
        }
        return parsed;
    }

    /**
     * Compares the new parsed data with the monitor's current state.
     * Detects changes in SupportedRegions and new/removed MarketGeos identifiers.
     * @param {object} newData The newly parsed data.
     * @returns {{changes: Array}|null} An array of detected changes, or null if no changes.
     */
    compare(newData) {
        const detectedChanges = [];

        // Patch missing data from state to prevent false positives on partial failures (e.g. timeouts)
        const keysToPatch = [
            'configRegion',
            'configMarketGeoIdentifiers',
            'configAltRegion',
            'configAltMarketGeoIdentifiers',
        ];

        for (const key of keysToPatch) {
            if (newData[key] === undefined && this.state[key]) {
                newData[key] = this.state[key];
            }
        }

        // Compare main config region data
        if (this.state.configRegion !== newData.configRegion) {
            const oldData = this.state.configRegion || '{}';
            const changes = diff.diffLines(oldData, newData.configRegion || '{}');
            let diffString = '';
            changes.forEach((part) => {
                const prefix = part.added ? '🟢 ' : part.removed ? '🔴 ' : '  ';
                const lines = part.value.replace(/\n$/, '').split('\n');
                lines.forEach(line => {
                    diffString += `${prefix}${line}\n`;
                });
            });
            if (diffString.length > 1900) {
                diffString = diffString.substring(0, 1900) + '\n... (truncated)';
            }
            detectedChanges.push({ type: 'regionDiff', configName: 'main config', diff: diffString, url: this.CONFIG_URL });
        }

        /**
         * Helper to find MarketGeo changes (additions and removals).
         * @param {Array} oldGeos The list of old MarketGeos.
         * @param {Array} newGeos The list of new MarketGeos.
         * @param {string} configName The name of the configuration source.
         * @param {string} url The URL of the configuration source.
         * @returns {Array} An array of detected change objects.
         */
        const findMarketGeoChanges = (oldGeos = [], newGeos = [], configName, url) => {
            const changes = [];
            // Additions
            newGeos.filter(newGeo => !oldGeos.some(oldGeo => oldGeo.id === newGeo.id))
                .forEach(geo => changes.push({ type: 'newMarketGeo', configName, geo, url }));
            // Removals
            oldGeos.filter(oldGeo => !newGeos.some(newGeo => newGeo.id === oldGeo.id))
                .forEach(geo => changes.push({ type: 'removedMarketGeo', configName, geo, url }));
            return changes;
        };

        // Compare main config MarketGeos
        detectedChanges.push(...findMarketGeoChanges(
            this.state.configMarketGeoIdentifiers,
            newData.configMarketGeoIdentifiers,
            'main config',
            this.CONFIG_URL
        ));

        // Compare alt config region data
        if (this.state.configAltRegion !== newData.configAltRegion) {
            const oldData = this.state.configAltRegion || '{}';
            const changes = diff.diffLines(oldData, newData.configAltRegion || '{}');
            let diffString = '';
            changes.forEach((part) => {
                const prefix = part.added ? '🟢 ' : part.removed ? '🔴 ' : '  ';
                const lines = part.value.replace(/\n$/, '').split('\n');
                lines.forEach(line => {
                    diffString += `${prefix}${line}\n`;
                });
            });
            if (diffString.length > 1900) {
                diffString = diffString.substring(0, 1900) + '\n... (truncated)';
            }
            detectedChanges.push({ type: 'regionDiff', configName: 'alt config', diff: diffString, url: this.CONFIG_ALT_URL });
        }

        // Compare alt config MarketGeos
        detectedChanges.push(...findMarketGeoChanges(
            this.state.configAltMarketGeoIdentifiers,
            newData.configAltMarketGeoIdentifiers,
            'alt config',
            this.CONFIG_ALT_URL
        ));

        return detectedChanges.length > 0 ? { changes: detectedChanges } : null;
    }

    /**
     * Sends Discord notifications based on the detected changes.
     * @param {{changes: Array}} detectedChanges Object containing an array of changes.
     */
    notify(detectedChanges) {
        const channel = this.getNotificationChannel();
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }

        const marketGeoChanges = [
            { type: 'newMarketGeo', title: '🌟 ¡Nueva región en Transit para Apple Pay! 🐸', color: '#0071E3' },
            { type: 'removedMarketGeo', title: '🚫 ¡Región eliminada de Transit para Apple Pay! 🐸', color: '#F44336' }
        ];

        detectedChanges.changes.forEach(change => {
            if (change.type === 'regionDiff') {
                const embed = new Discord.EmbedBuilder()
                    .setTitle(`¡Cambio en Apple Pay para ${this.REGION_TO_MONITOR}! 🐸`)
                    .addFields([
                        { name: `🔗 URL`, value: `${change.url}` },
                        { name: '📝 Cambios detectados', value: `\`\`\`diff\n${sanitizeMarkdown(change.diff.trim())}\n\`\`\`` }
                    ])
                    .setFooter({ text: `Fuente: ${change.configName}` })
                    .setColor('#0071E3');
                channel.send({ embeds: [embed] });
            } else {
                const config = marketGeoChanges.find(c => c.type === change.type);
                if (config) {
                    const embed = new Discord.EmbedBuilder()
                        .setTitle(config.title)
                        .addFields([
                            { name: '📍 Región', value: this.REGION_TO_MONITOR, inline: true },
                            { name: '🏷️ Nombre', value: sanitizeMarkdown(change.geo.name || 'Unknown'), inline: true },
                            { name: '🔗 URL', value: change.url }
                        ])
                        .setFooter({ text: `Fuente: ${change.configName}` })
                        .setColor(config.color);
                    channel.send({ embeds: [embed] });
                }
            }
        });
    }
}

module.exports = ApplePayMonitor;
