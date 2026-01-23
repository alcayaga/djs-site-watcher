/**
 * This module is responsible for monitoring Apple's servers for updates to iOS Carrier Bundles.
 * It periodically fetches a property list (plist) file from Apple, parses it, and checks
 * for new versions of carrier settings for a predefined list of carriers.
 * If an update is found, it sends a notification to a Discord channel.
 */

const got = require('got');
const plist = require('plist');
const fs = require('fs-extra');
const Discord = require('discord.js');

// The URL to Apple's property list file containing carrier bundle information.
const anana = 'https://s.mzstatic.com/version';
const file = './src/carriers.json';
var carriersToMonitor = [];

// The list of specific carrier bundles to monitor for updates.
const carriers = [
    'EntelPCS_cl',
    'movistar_cl',
    'Claro_cl',
    'Nextel_cl'
];

/**
 * Initializes the carrier monitor by loading the last known carrier data from a local JSON file.
 * This data is used to compare against the fresh data fetched from Apple's servers.
 * @param {Discord.Client} client The active Discord client instance.
 */
async function initialize(client) {
    try {
        const data = await fs.readJSON(file);
        carriersToMonitor = Array.isArray(data) ? data : [];
    } catch (err) {
        console.log('Cannot read carriers.json');
        carriersToMonitor = [];
    }
}

/**
 * Fetches the latest carrier bundle data from Apple's servers,
 * compares it against the locally stored versions, and triggers notifications for any changes.
 * @param {Discord.Client} client The active Discord client instance.
 */
async function check(client) {
    console.log('Checking for new carrier bundles...');
    try {
        const response = await got(anana);
        const data = plist.parse(response.body);
        const bundles = data.MobileDeviceCarrierBundlesByProductVersion;

        let changes = false;
        for (const carrier of carriers) {
            if (bundles[carrier]) {
                const carrierData = bundles[carrier];
                const versions = Object.keys(carrierData).filter(k => k !== 'ByProductType');
                
                // Sort version numbers to correctly identify the latest version.
                // This handles versions like "15.5" vs "15.4.1" correctly.
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

                let existingCarrier = carriersToMonitor.find(c => c.id === carrier);
                if (existingCarrier) {
                    // If the carrier is already being monitored, check if the version or build has changed.
                    if (existingCarrier.version !== latestVersion || existingCarrier.build !== latestBuild) {
                        existingCarrier.version = latestVersion;
                        existingCarrier.build = latestBuild;
                        existingCarrier.lastUpdated = new Date().toLocaleString();
                        existingCarrier.url = bundleURL;
                        notify(existingCarrier, client);
                        changes = true;
                    }
                } else {
                    // If it's a new carrier (not in our local file yet), add it and notify.
                    const newCarrier = {
                        id: carrier,
                        version: latestVersion,
                        build: latestBuild,
                        lastUpdated: new Date().toLocaleString(),
                        url: bundleURL
                    };
                    carriersToMonitor.push(newCarrier);
                    notify(newCarrier, client);
                    changes = true;
                }
            }
        }

        if (changes) {
            await fs.outputJSON(file, carriersToMonitor, { spaces: 2 });
        }
    } catch (err) {
        console.log(err);
    }
}

/**
 * Sends a notification to a Discord channel about a new carrier bundle version.
 * @param {object} carrier The carrier object containing details about the update.
 * @param {Discord.Client} client The active Discord client instance.
 */
function notify(carrier, client) {
    console.log('New carrier bundle version found:');
    console.log(carrier);
    let channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
    if (channel) {
        const embed = new Discord.MessageEmbed();
        embed.setTitle(`📲 ¡Nuevo Carrier Bundle para ${carrier.id}!`);
        embed.addField(`Versión`, `${carrier.version}`);
        embed.addField(`Build`, `${carrier.build}`);
        embed.addField(`URL`, `${carrier.url}`);
        embed.addField(`Actualizado`, `${carrier.lastUpdated}`);
        embed.setColor('0x00FF00');
        channel.send(embed);
    }
}

module.exports = {
    initialize,
    check
};
