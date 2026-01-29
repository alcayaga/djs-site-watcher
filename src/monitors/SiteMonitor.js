const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const crypto = require('crypto');
const diff = require('diff');
const got = require('got');
const storage = require('../storage');

/**
 * Monitor for changes on arbitrary websites based on CSS selectors.
 * Extends the base Monitor class to provide specific logic for fetching, parsing, comparing, and notifying about website content changes.
 */
class SiteMonitor extends Monitor {
    /**
     * An empty parse method to satisfy the abstract class, as parsing is handled in the check method.
     */
    parse() {
        // Parsing is handled in the check method for this monitor
    }

    /**
     * Overrides the base check method to handle an array of sites.
     * @param {Discord.Client} client The Discord client instance.
     */
    async check(client) {
        console.log(`Checking for ${this.name} updates...`);
        let sitesArray = Array.isArray(this.state) ? this.state : [];
        let hasChanges = false;

        const checkPromises = sitesArray.map(async (site) => {
            try {
                const response = await got(site.url);
                const dom = new JSDOM(response.body);
                let content = '';

                if (site.css) {
                    const selector = dom.window.document.querySelector(site.css);
                    content = selector ? selector.textContent : '';
                } else {
                    content = dom.window.document.querySelector('head').textContent;
                }

                const hash = crypto.createHash('md5').update(content).digest('hex');

                if (site.hash !== hash) {
                    const oldContent = site.lastContent || '';
                    site.lastChecked = new Date().toLocaleString();
                    site.lastUpdated = new Date().toLocaleString();
                    site.hash = hash;
                    site.lastContent = content;
                    hasChanges = true;
                    this.notify(client, { site, oldContent, newContent: content, dom });
                } else {
                    site.lastChecked = new Date().toLocaleString();
                }
                return site;
            } catch (err) {
                console.log(`${site.url} : ${err}`);
                return site;
            }
        });

        const updatedSites = await Promise.all(checkPromises);

        if (hasChanges) {
            await this.saveState(updatedSites);
        }
    }
    
    /**
     * Overrides the base loadState to load from the `sites.json` file.
     * @returns {Promise<Array>} The loaded state.
     */
    async loadState() {
        try {
            const data = await storage.read(this.config.file);
            if (Array.isArray(data)) {
                return data;
            } else if (data && Array.isArray(data.sites)) {
                return data.sites;
            }
            return [];
        } catch {
            console.log(`Could not load state for ${this.name} from ${this.config.file}. Starting fresh.`);
            return [];
        }
    }

    /**
     * Sends a notification for a changed site.
     * @param {Discord.Client} client The Discord client instance.
     * @param {object} change The change object containing site, old/new content, and dom.
     */
    notify(client, change) {
        const { site, oldContent, newContent, dom } = change;
        const channel = this.getNotificationChannel(client);
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }

        console.log(`Change detected! ${site.url}`);
        
        let title = dom.window.document.title || site.id;

        const changes = diff.diffLines(oldContent, newContent);
        let diffString = '';
        changes.forEach((part) => {
            const prefix = part.added ? '🟢' : part.removed ? '🔴' : '⚪';
            if ((!part.added && !part.removed) && diffString.length >= 1800) return;
            if (!part.value) return;
            const endsWithNewline = part.value.endsWith('\n');
            const valueToProcess = endsWithNewline ? part.value.slice(0, -1) : part.value;
            const prefixedLines = valueToProcess.split('\n').map(line => prefix + line).join('\n');
            diffString += prefixedLines;
            if (endsWithNewline) diffString += '\n';
        });

        if (diffString.length > 1900) {
            diffString = diffString.substring(0, 1900) + '\n... (truncated)';
        }

        const embed = new Discord.MessageEmbed()
            .setTitle(`🔎 ¡Cambio en ${title}!  🐸`)
            .addField(`URL`, `${site.url}`)
            .addField(`Último cambio`, `${site.lastUpdated}`, true)
            .addField(`Actualizado`, `${site.lastUpdated}`, true)
            .setColor('0x6058f3');
            
        channel.send(embed);
        channel.send(` 
${diffString}
 `);
    }
}

module.exports = SiteMonitor;
