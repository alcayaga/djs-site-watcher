const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const crypto = require('crypto');
const diff = require('diff');
const got = require('got');
const storage = require('../storage');

/**
 * Cleans the text by trimming lines and removing empty ones.
 * @param {string} text The text to clean.
 * @returns {string} The cleaned text.
 */
function cleanText(text) {
    if (!text) return '';
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
}

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
     */
    async check() {
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

                content = cleanText(content);

                const hash = crypto.createHash('md5').update(content).digest('hex');

                if (site.hash !== hash) {
                    const oldContent = site.lastContent || '';
                    const cleanOldContent = cleanText(oldContent);
                    
                    site.lastChecked = new Date().toLocaleString();
                    site.lastUpdated = new Date().toLocaleString();
                    site.hash = hash;
                    site.lastContent = content;
                    
                    if (cleanOldContent !== content) {
                        hasChanges = true;
                        this.notify({ site, oldContent, newContent: content, dom });
                    } else {
                        // Silent update (Migration to clean content)
                        hasChanges = true; 
                        console.log(`[Migration] Updated ${site.url} to clean content format without notification.`);
                    }
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
     * @param {object} change The change object containing site, old/new content, and dom.
     */
    notify(change) {
        const { site, oldContent, newContent, dom } = change;
        const channel = this.getNotificationChannel();
        if (!channel) {
            console.error(`Notification channel not found for ${this.name}.`);
            return;
        }

        console.log(`Change detected! ${site.url}`);
        
        let title = dom.window.document.title || site.id;

        const changes = diff.diffLines(oldContent, newContent);
        const allLines = [];
        changes.forEach((part) => {
            const type = part.added ? 'added' : part.removed ? 'removed' : 'context';
            if (!part.value) return;
            const valueToProcess = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;
            const lines = valueToProcess.split('\n');
            lines.forEach(line => allLines.push({ content: line, type }));
        });

        const CONTEXT_LINES = 3;
        const linesToKeep = new Set();
        allLines.forEach((line, index) => {
            if (line.type !== 'context') {
                for (let i = Math.max(0, index - CONTEXT_LINES); i <= Math.min(allLines.length - 1, index + CONTEXT_LINES); i++) {
                    linesToKeep.add(i);
                }
            }
        });

        let diffString = '';
        let lastIndex = -1;
        allLines.forEach((line, index) => {
            if (linesToKeep.has(index)) {
                if (lastIndex !== -1 && index !== lastIndex + 1) {
                    diffString += '... \n';
                }
                const prefix = line.type === 'added' ? '🟢 ' : line.type === 'removed' ? '🔴 ' : '⚪ ';
                diffString += prefix + line.content + '\n';
                lastIndex = index;
            }
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
