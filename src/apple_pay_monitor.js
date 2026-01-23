const got = require('got');
const fs = require('fs-extra');
const Discord = require('discord.js');
const crypto = require('crypto');
const diff = require('diff');

const RESPONSES_FILE = './src/apple_pay_responses.json';

class ApplePayMonitor {
    constructor() {
        this.monitoredData = {};
        this.CONFIG_URL = 'https://smp-device-content.apple.com/static/region/v2/config.json';
        //this.CONFIG_ALT_URL = 'https://smp-device-content.apple.com/static/region/v2/config-alt.json';
        this.CONFIG_ALT_URL = 'https://test.alcayaga.net/config.json';
    }

    async initialize() {
        try {
            this.monitoredData = await fs.readJSON(RESPONSES_FILE);
        } catch (err) {
            console.log(`Cannot read ${RESPONSES_FILE}, starting fresh.`);
            this.monitoredData = {};
        }
    }

    async check(client) {
        console.log('Checking for new Apple Pay configurations...');
        let hasChanges = false;

        const processConfigFile = async (url, key) => {
            try {
                const response = await got(url, { responseType: 'json' });
                const data = response.body;

                const clRegionData = data.SupportedRegions ? data.SupportedRegions['CL'] : undefined;
                if (clRegionData) {
                    const clRegionDataString = JSON.stringify(clRegionData, null, 2);
                    const currentHash = crypto.createHash('md5').update(clRegionDataString).digest('hex');

                    if (!this.monitoredData[key]) {
                        this.monitoredData[key] = { hash: '', data: '' };
                    }

                    if (this.monitoredData[key].hash !== currentHash) {
                        console.log(`Change detected in ${key} SupportedRegions['CL']`);
                        if (this.monitoredData[key].hash) {
                            const oldData = this.monitoredData[key].data || '{}';
                            const oldJsonString = JSON.stringify(JSON.parse(oldData), null, 2);
                            const newJsonString = JSON.stringify(clRegionData, null, 2);
                            const changes = diff.diffLines(oldJsonString, newJsonString);

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
                            this.notifyDiff(key, diffString, client, url);
                        }
                        this.monitoredData[key].hash = currentHash;
                        this.monitoredData[key].data = JSON.stringify(clRegionData);
                        hasChanges = true;
                    }
                }

                const marketGeosURL = data.MarketGeosURL;
                if (marketGeosURL) {
                    if (!this.monitoredData[key].marketgeos) {
                        this.monitoredData[key].marketgeos = { url: '', identifiers: [] };
                    }

                    const marketGeosResponse = await got(marketGeosURL, { responseType: 'json' });
                    const marketGeosData = marketGeosResponse.body;
                    const clMarketGeos = marketGeosData.MarketGeos.filter(geo => geo.Region === 'CL');
                    const currentIdentifiers = clMarketGeos.map(geo => geo.Identifier);

                    const oldIdentifiers = this.monitoredData[key].marketgeos.identifiers || [];
                    const newIdentifiers = currentIdentifiers.filter(id => !oldIdentifiers.includes(id));

                    if (newIdentifiers.length > 0) {
                        console.log(`New MarketGeos found in ${key}`);
                        newIdentifiers.forEach(id => {
                            const newGeo = clMarketGeos.find(geo => geo.Identifier === id);
                            if (newGeo) this.notifyNewMarketGeo(key, newGeo, client, marketGeosURL);
                        });
                        this.monitoredData[key].marketgeos.identifiers = currentIdentifiers;
                        this.monitoredData[key].marketgeos.url = marketGeosURL;
                        hasChanges = true;
                    }
                }
            } catch (err) {
                console.error(`Error checking Apple Pay config ${url}:`, err);
            }
        };

        await processConfigFile(this.CONFIG_URL, 'config');
        await processConfigFile(this.CONFIG_ALT_URL, 'config-alt');
        if (hasChanges) {
            await fs.outputJSON(RESPONSES_FILE, this.monitoredData, { spaces: 2 });
        }
    }

    notifyDiff(configName, diffString, client, url) {
        const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
        if (channel) {
            const embed = new Discord.MessageEmbed();
            embed.setTitle(`🔎 ¡Cambio en Apple Pay ${configName} for CL region!`);
            embed.addField(`URL`, `${url}`);
            embed.setColor('#0071E3');
            channel.send(embed);
            channel.send(`\`\`\`diff\n${diffString}\n\`\`\``);
        }
    }

    notifyNewMarketGeo(configName, geo, client, url) {
        const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
        if (channel) {
            const embed = new Discord.MessageEmbed();
            embed.setTitle(`🌟 ¡Nuevo MarketGeo de Apple Pay encontrado en ${configName}!`);
            embed.addField('Región', geo.Region, true);
            embed.addField('Nombre Localizado', geo.LocalizedName.en, true);
            embed.addField('URL de MarketGeos', url);
            embed.setColor('#0071E3');
            channel.send(embed);
        }
    }
}

// Export a default instance for the application to use
const defaultMonitor = new ApplePayMonitor();
module.exports = defaultMonitor;

// Export the class for testing purposes
module.exports.ApplePayMonitor = ApplePayMonitor;