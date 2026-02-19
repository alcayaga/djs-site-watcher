const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const { sanitizeMarkdown, sanitizeLinkText } = require('../utils/formatters');
const logger = require('../utils/logger');

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
            logger.warn('Could not find section for %s on the eSIM page.', countryToMonitor);
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
     * @param {{added: Array, removed: Array}} changes The changes to notify about.
     * @returns {Promise<void>}
     */
    async notify(changes) {
        const channel = this.getNotificationChannel();
        if (!channel) {
            logger.error('Notification channel not found for %s.', this.name);
            return;
        }
        const country = this.config.country || 'Chile';
        const notificationConfigs = [
            { key: 'added', title: `📱 ¡Operador de eSIM agregado en ${country}! 🐸`, color: '#4CAF50', action: 'added' },
            { key: 'removed', title: `📱 ¡Operador de eSIM eliminado en ${country}! 🐸`, color: '#F44336', action: 'removed' }
        ];

        const notificationPromises = notificationConfigs.flatMap(config =>
            (changes[config.key] || []).map(carrier => {
                logger.info('Apple eSIM carrier change in %s: %s was %s.', country, carrier.name, config.action);
                const sanitizedName = sanitizeLinkText(carrier.name);
                const sanitizedLink = encodeURI(carrier.link);
                const embed = new Discord.EmbedBuilder()
                    .setTitle(config.title)
                    .addFields([
                        { name: '📡 Operador', value: `[${sanitizedName}](${sanitizedLink})`, inline: true },
                        { name: '✨ Capacidad', value: sanitizeMarkdown(carrier.capability), inline: true }
                    ])
                    .setColor(config.color);
                return channel.send({ embeds: [embed] });
            })
        );
        await Promise.all(notificationPromises);
    }
}

module.exports = AppleEsimMonitor;
