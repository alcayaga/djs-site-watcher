
const got = require('got');
const plist = require('plist');
const fs = require('fs-extra');
const Discord = require('discord.js');

const anana = 'https://s.mzstatic.com/version';
const file = './src/carriers.json';
var carriersToMonitor = [];

const carriers = [
    'EntelPCS_cl',
    'movistar_cl',
    'Claro_cl',
    'Nextel_cl'
];

async function initialize(client, debug = false) {
    try {
        carriersToMonitor = await fs.readJSON(file);
    } catch (err) {
        console.log('Cannot read carriers.json');
    }
}

async function check(client, debug = false) {
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
                    if (existingCarrier.version !== latestVersion || existingCarrier.build !== latestBuild) {
                        existingCarrier.version = latestVersion;
                        existingCarrier.build = latestBuild;
                        existingCarrier.lastUpdated = new Date().toLocaleString();
                        existingCarrier.url = bundleURL;
                        notify(existingCarrier, client);
                        changes = true;
                    }
                } else {
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
