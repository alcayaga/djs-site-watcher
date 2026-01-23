/**
 * @fileoverview This module is responsible for monitoring Apple's eSIM Carrier Support page
 * for changes in carrier availability for specific regions, especially Chile.
 * @module apple_esim_monitor
 */

const got = require('got');
const { JSDOM } = require('jsdom');
const fs = require('fs-extra');
const Discord = require('discord.js');

const APPLE_ESIM_URL = 'https://support.apple.com/en-us/101569';
const ESIM_FILE = './src/apple_esim.json';
let monitoredESIMData = {};

/**
 * Initializes the monitor by loading the last known eSIM data from a local JSON file.
 * If the file does not exist, it starts with an empty object.
 * @async
 */
async function initialize() {
    try {
        monitoredESIMData = await fs.readJSON(ESIM_FILE);
    } catch (err) {
        console.log(`Cannot read ${ESIM_FILE}, starting fresh.`);
        monitoredESIMData = {};
    }
}

/**
 * Fetches the latest eSIM carrier data from Apple's page,
 * compares it against the stored data, and triggers notifications on changes.
 * Specifically monitors the "Chile" section and excludes "Worldwide service providers".
 * @param {Discord.Client} client The active Discord client instance.
 * @async
 */
async function check(client) {
    console.log('Checking for new Apple eSIM carrier changes...');
    try {
        const response = await got(APPLE_ESIM_URL);
        const dom = new JSDOM(response.body);
        const document = dom.window.document;

        const currentESIMData = {};
        const countryToMonitor = 'Chile';

        const countryHeading = Array.from(document.querySelectorAll('h2'))
            .find(heading => heading.textContent.trim() === countryToMonitor);

        if (!countryHeading) {
            console.warn(`Could not find section for ${countryToMonitor} on the eSIM page.`);
            return;
        }

        const carriers = [];
        let nextElement = countryHeading.nextElementSibling;
        let currentCapability = 'General';

        while (nextElement && nextElement.tagName !== 'H2') {
            const h3 = nextElement.querySelector('h3') || (nextElement.tagName === 'H3' ? nextElement : null);
            if (h3) {
                currentCapability = h3.textContent.trim();
            }

            const list = nextElement.querySelector('ul, ol') || (nextElement.matches('ul, ol') ? nextElement : null);
            if (list) {
                list.querySelectorAll('li').forEach(li => {
                    const linkElement = li.querySelector('a');
                    if (linkElement) {
                        carriers.push({
                            name: linkElement.textContent.trim(),
                            link: linkElement.href,
                            capability: currentCapability,
                        });
                    }
                });
            }
            nextElement = nextElement.nextElementSibling;
        }

        if (carriers.length > 0) {
            currentESIMData[countryToMonitor] = carriers.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Compare with monitored eSIM data and notify if there are changes
        let hasChanges = false;
        if (!monitoredESIMData[countryToMonitor]) {
            // Initial run or new country added
            if (currentESIMData[countryToMonitor]) {
                currentESIMData[countryToMonitor].forEach(carrier => {
                    notify(countryToMonitor, carrier, client);
                });
                hasChanges = true;
            }
        } else {
            const storedCarriers = monitoredESIMData[countryToMonitor];
            const newCarriers = currentESIMData[countryToMonitor] || [];

            // Check for new carriers
            newCarriers.forEach(carrier => {
                if (!storedCarriers.some(c => c.name === carrier.name && c.capability === carrier.capability)) {
                    notify(countryToMonitor, carrier, client, 'added');
                    hasChanges = true;
                }
            });

            // Check for removed carriers
            storedCarriers.forEach(carrier => {
                if (!newCarriers.some(c => c.name === carrier.name && c.capability === carrier.capability)) {
                    notify(countryToMonitor, carrier, client, 'removed');
                    hasChanges = true;
                }
            });
        }

        if (hasChanges) {
            monitoredESIMData = currentESIMData;
            await fs.outputJSON(ESIM_FILE, monitoredESIMData, { spaces: 2 });
        }
        
    } catch (err) {
        console.error('Error checking for Apple eSIM changes:', err);
    }
}

/**
 * Sends a notification to a Discord channel about an eSIM carrier change.
 * @param {string} country The country where the change occurred.
 * @param {string} carrier The carrier name that was added or removed.
 * @param {Discord.Client} client The active Discord client instance.
 * @param {string} type The type of change ('added' or 'removed').
 */
function notify(country, carrier, client, type = 'added') {
    console.log(`Apple eSIM carrier change in ${country}: ${carrier.name} was ${type}.`);
    const channel = client.channels.cache.get(process.env.DISCORDJS_TEXTCHANNEL_ID);
    if (channel) {
        const embed = new Discord.MessageEmbed();
        embed.setTitle(`📱 ¡Operador de eSIM ${type === 'added' ? 'agregado' : 'eliminado'} en ${country}!`);
        embed.addField('Operador', `[${carrier.name}](${carrier.link})`);
        embed.addField('Capacidad', carrier.capability);
        embed.setColor(type === 'added' ? '#4CAF50' : '#F44336'); // Green for added, Red for removed
        channel.send(embed);
    }
}

module.exports = {
    initialize,
    check
};
