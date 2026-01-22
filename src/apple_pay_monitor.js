/**
 * This module is responsible for monitoring Apple's Pay configuration files.
 */

const got = require('got');
const fs = require('fs-extra');
const Discord = require('discord.js');
const crypto = require('crypto');
const diff = require('diff');

const RESPONSES_FILE = './src/apple_pay_responses.json';
let monitoredData = {};

const CONFIG_URL = 'https://smp-device-content.apple.com/static/region/v2/config.json';
const CONFIG_ALT_URL = 'https://smp-device-content.apple.com/static/region/v2/config-alt.json';

/**
 * Initializes the monitor by loading the last known data from a local JSON file.
 */
async function initialize() {
    try {
        monitoredData = await fs.readJSON(RESPONSES_FILE);
    } catch (err) {
        console.log(`Cannot read ${RESPONSES_FILE}, starting fresh.`);
        monitoredData = {};
    }
}

/**
 * Fetches the latest configuration data from Apple's servers,
 * compares it against the stored data, and triggers notifications on changes.
 * @param {Discord.Client} client The active Discord client instance.
 */
async function check(client) {
    console.log('Checking for new Apple Pay configurations...');
    let hasChanges = false;

    // Helper function to process each config file
    const processConfigFile = async (url, key) => {
        try {
            const response = await got(url, { responseType: 'json' });
            const data = response.body;

            // 1. Check for changes in SupportedRegions["CL"]
            const clRegionData = data.SupportedRegions ? data.SupportedRegions['CL'] : undefined;
            if (clRegionData) {
                const clRegionDataString = JSON.stringify(clRegionData, null, 2);
                const currentHash = crypto.createHash('md5').update(clRegionDataString).digest('hex');

                if (!monitoredData[key]) {
                    monitoredData[key] = { hash: '', data: '' };
                }

                if (monitoredData[key].hash !== currentHash) {
                    console.log(`Change detected in ${key} SupportedRegions['CL']`);
                    if (monitoredData[key].hash) { // Don't notify on first run
                        const oldData = monitoredData[key].data || '';
                        const changes = diff.diffJson(JSON.parse(oldData), clRegionData);
                        let diffString = '';
                        changes.forEach((part) => {
                            const prefix = part.added ? '🟢' : part.removed ? '🔴' : '⚪';
                             if ((!part.added && !part.removed) && diffString.length >= 1800) {
                                return;
                            }
                            if (!part.value) return;
                            const endsWithNewline = part.value.endsWith('\n');
                            const valueToProcess = endsWithNewline ? part.value.slice(0, -1) : part.value;
                            const prefixedLines = valueToProcess.split('\n').map(line => prefix + line).join('\n');
                            diffString += prefixedLines;
                            if (endsWithNewline) {
                                diffString += '\n';
                            }
                        });
                        if (diffString.length > 1900) {
                            diffString = diffString.substring(0, 1900) + '\n... (truncated)';
                        }
                        notifyDiff(key, diffString, client, url);
                    }
                    monitoredData[key].hash = currentHash;
                    monitoredData[key].data = JSON.stringify(clRegionData);
                    hasChanges = true;
                }
            }

            // 2. Check for new MarketGeos
            const marketGeosURL = data.MarketGeosURL;
            if (marketGeosURL) {
                if (!monitoredData[key].marketgeos) {
                    monitoredData[key].marketgeos = { url: '', identifiers: [] };
                }

                const marketGeosResponse = await got(marketGeosURL, { responseType: 'json' });
                const marketGeosData = marketGeosResponse.body;
                const clMarketGeos = marketGeosData.MarketGeos.filter(geo => geo.Region === 'CL');
                const currentIdentifiers = clMarketGeos.map(geo => geo.identifier);

                const oldIdentifiers = monitoredData[key].marketgeos.identifiers || [];
                const newIdentifiers = currentIdentifiers.filter(id => !oldIdentifiers.includes(id));

                if (newIdentifiers.length > 0) {
                    console.log(`New MarketGeos found in ${key}`);
                    newIdentifiers.forEach(id => {
                        const newGeo = clMarketGeos.find(geo => geo.identifier === id);
                        if (newGeo) {
                            notifyNewMarketGeo(key, newGeo, client, marketGeosURL);
                        }
                    });
                    monitoredData[key].marketgeos.identifiers = currentIdentifiers;
                    monitoredData[key].marketgeos.url = marketGeosURL;
                    hasChanges = true;
                }
            }
        } catch (err) {
            console.error(`Error checking Apple Pay config ${url}:`, err);
        }
    };

    await processConfigFile(CONFIG_URL, 'config');
    await processConfigFile(CONFIG_ALT_URL, 'config-alt');
    if (hasChanges) {
        await fs.outputJSON(RESPONSES_FILE, monitoredData, { spaces: 2 });
    }
}

/**
 * Sends a notification to a Discord channel about a change in config.
 * @param {string} configName The name of the config (e.g., 'config', 'config-alt').
 * @param {string} diffString The diff string to send.
 * @param {Discord.Client} client The active Discord client instance.
 * @param {string} url The URL of the config file.
 */
function notifyDiff(configName, diffString, client, url) {
    const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
    if (channel) {
        const embed = new Discord.MessageEmbed();
        embed.setTitle(`🔎 ¡Cambio en Apple Pay ${configName}!`);
        embed.addField(`URL`, `${url}`);
        embed.setColor('#0071E3');
        channel.send(embed);
        channel.send(` 
${diffString}
 `);
    }
}

/**
 * Sends a notification to a Discord channel about a new MarketGeo.
 * @param {string} configName The name of the config source (e.g., 'config', 'config-alt').
 * @param {object} geo The new MarketGeo object.
 * @param {Discord.Client} client The active Discord client instance.
 * @param {string} url The URL of the marketgeos file.
 */
function notifyNewMarketGeo(configName, geo, client, url) {
    const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
    if (channel) {
        const embed = new Discord.MessageEmbed();
        embed.setTitle(`🌟 ¡Nuevo MarketGeo de Apple Pay encontrado en ${configName}!`);
        embed.addField('Región', geo.Region, true);
        embed.addField('Nombre Localizado', geo.LocalizedName, true);
        embed.addField('URL de MarketGeos', url);
        embed.setColor('#0071E3');
        channel.send(embed);
    }
}


module.exports = {
    initialize,
    check
};
