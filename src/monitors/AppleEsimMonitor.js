const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');

/**
 * Monitor for Apple eSIM carrier availability.
 * Extends the base Monitor class to provide specific logic for parsing, comparing, and notifying about eSIM carrier changes.
 */
class AppleEsimMonitor extends Monitor {
    /**
     * Parses the HTML content to extract eSIM carrier data for the configured country.
     * @param {string} data The HTML content of the page.
     * @returns {object} The parsed carrier data, keyed by country.
     */
    parse(data) {
        const dom = new JSDOM(data);
        const document = dom.window.document;
        const parsedData = {};
        const countryToMonitor = this.config.country || 'Chile'; // Default to Chile if not specified

        const countryHeading = Array.from(document.querySelectorAll('h2'))
            .find(heading => heading.textContent.trim() === countryToMonitor);

        if (!countryHeading) {
            console.warn(`Could not find section for ${countryToMonitor} on the eSIM page.`);
            return this.state; // Return old state if section not found
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
            parsedData[countryToMonitor] = carriers.sort((a, b) => a.name.localeCompare(b.name));
        }

        return parsedData;
    }

    /**
     * Compares the old state with the new data to find added or removed carriers.
     * @param {object} newData The newly parsed carrier data.
     * @returns {{added: Array, removed: Array}|null} An object with arrays of added and removed carriers, or null if no changes.
     */
    compare(newData) {
        const country = this.config.country || 'Chile';
        const oldCarriers = (this.state && this.state[country]) ? this.state[country] : [];
        const newCarriers = newData[country] || [];
        
        const added = newCarriers.filter(newCarrier => 
            !oldCarriers.some(oldCarrier => oldCarrier.name === newCarrier.name && oldCarrier.capability === newCarrier.capability)
        );

        const removed = oldCarriers.filter(oldCarrier => 
            !newCarriers.some(newCarrier => newCarrier.name === oldCarrier.name && newCarrier.capability === oldCarrier.capability)
        );

        if (added.length > 0 || removed.length > 0) {
            return { added, removed };
        }

        return null;
    }

    /**
     * Sends notifications for added or removed carriers.
     * @param {Discord.Client} client The Discord client instance.
     * @param {{added: Array, removed: Array}} changes The changes to notify about.
     */
    notify(client, changes) {
        const channel = this.getNotificationChannel(client);
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }
        const country = this.config.country || 'Chile';

        changes.added.forEach(carrier => {
            console.log(`Apple eSIM carrier change in ${country}: ${carrier.name} was added.`);
            const embed = new Discord.MessageEmbed()
                .setTitle(`📱 ¡Operador de eSIM agregado en ${country}!`)
                .addField('Operador', `[${carrier.name}](${carrier.link})`)
                .addField('Capacidad', carrier.capability)
                .setColor('#4CAF50'); // Green for added
            channel.send(embed);
        });

        changes.removed.forEach(carrier => {
            console.log(`Apple eSIM carrier change in ${country}: ${carrier.name} was removed.`);
            const embed = new Discord.MessageEmbed()
                .setTitle(`📱 ¡Operador de eSIM eliminado en ${country}!`)
                .addField('Operador', `[${carrier.name}](${carrier.link})`)
                .addField('Capacidad', carrier.capability)
                .setColor('#F44336'); // Red for removed
            channel.send(embed);
        });
    }
}

module.exports = AppleEsimMonitor;
