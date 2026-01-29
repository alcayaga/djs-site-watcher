const plist = require('plist');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');

/**
 * Monitor for Apple Carrier Bundle updates.
 * Extends the base Monitor class to provide specific logic for parsing, comparing, and notifying about carrier bundle changes from plist data.
 */
class CarrierMonitor extends Monitor {
    /**
     * Parses the plist content to extract carrier bundle information.
     * @param {string} data The plist content as a string.
     * @returns {object} The parsed carrier data.
     */
    parse(data) {
        const parsedPlist = plist.parse(data);
        const bundles = parsedPlist.MobileDeviceCarrierBundlesByProductVersion;
        const parsedData = {};

        const carriersToMonitor = this.config.carriers || [];

        if (!bundles || typeof bundles !== 'object') {
            return parsedData; // Return empty if bundles are not found or malformed
        }

        for (const carrier of carriersToMonitor) {
            if (bundles[carrier]) {
                const carrierData = bundles[carrier];
                const versions = Object.keys(carrierData).filter(k => k !== 'ByProductType');

                versions.sort((a, b) => {
                    const aParts = a.split('.').map(Number);
                    const bParts = b.split('.').map(Number);
                    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                        const aVal = aParts[i] || 0;
                        const bVal = bParts[i] || 0;
                        if (aVal !== bVal) {
                            return aVal - bVal;
                        }
                    }
                    return 0;
                });

                const latestVersion = versions[versions.length - 1];
                const latestBuild = carrierData[latestVersion].BuildVersion;
                const bundleURL = carrierData[latestVersion].BundleURL;

                parsedData[carrier] = {
                    id: carrier,
                    version: latestVersion,
                    build: latestBuild,
                    url: bundleURL,
                };
            }
        }
        return parsedData;
    }

    /**
     * Compares the old state with the new data to find updated carriers.
     * @param {object} newData The newly parsed carrier data.
     * @returns {{updated: Array}|null} An object with an array of updated carriers, or null if no changes.
     */
    compare(newData) {
        const updated = [];
        const oldCarriers = this.state || {};

        for (const carrierId in newData) {
            const newCarrier = newData[carrierId];
            const oldCarrier = oldCarriers[carrierId];

            if (!oldCarrier || oldCarrier.version !== newCarrier.version || oldCarrier.build !== newCarrier.build) {
                updated.push({ ...newCarrier, lastUpdated: new Date().toLocaleString() });
            }
        }
        
        if (updated.length > 0) {
            return { updated };
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
     * Sends notifications for updated carriers.
     * @param {Discord.Client} client The Discord client instance.
     * @param {{updated: Array}} changes The changes to notify about.
     */
    notify(client, changes) {
        const channel = client.channels.cache.get(config.DISCORDJS_TEXTCHANNEL_ID);
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }

        changes.updated.forEach(carrier => {
            console.log('New carrier bundle version found:', carrier);
            const embed = new Discord.MessageEmbed()
                .setTitle(`📲 ¡Nuevo Carrier Bundle para ${carrier.id}!`)
                .addField(`Versión`, `${carrier.version}`)
                .addField(`Build`, `${carrier.build}`)
                .addField(`URL`, `${carrier.url}`)
                .addField(`Actualizado`, `${carrier.lastUpdated}`)
                .setColor('0x00FF00');
            channel.send(embed);
        });
    }
}

module.exports = CarrierMonitor;
