const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const crypto = require('crypto');
const diff = require('diff');
const got = require('got');
const storage = require('../storage');
const { URL } = require('url');
const { getSafeGotOptions } = require('../utils/network');

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

const { formatDiscordTimestamp, sanitizeMarkdown } = require('../utils/formatters');
const CONTEXT_LINES = 3;

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
                const { content, hash, dom } = await this.fetchAndProcess(site.url, site.css);

                const title = dom.window.document.title;
                if (title && title.trim().length > 0 && site.id !== title) {
                    console.log(`[Migration] Updating ID for ${site.url} from '${site.id}' to '${title}'`);
                    site.id = title;
                    hasChanges = true;
                }

                if (site.hash !== hash) {
                    const oldContent = site.lastContent || '';
                    const cleanOldContent = cleanText(oldContent);
                    
                    site.lastChecked = new Date().toISOString();
                    site.lastUpdated = new Date().toISOString();
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
                    if (site.lastContent === undefined) {
                        site.lastContent = content;
                        hasChanges = true;
                        console.log(`[Migration] Backfilled lastContent for ${site.url} without notification.`);
                    }
                    site.lastChecked = new Date().toISOString();
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
     * Fetches and processes the content of a site.
     * @param {string} url The URL to fetch.
     * @param {string} css The CSS selector to use.
     * @returns {Promise<{content: string, hash: string, dom: JSDOM, selectorFound: boolean}>} The processed content.
     */
    async fetchAndProcess(url, css) {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Invalid protocol. Only http and https are allowed.');
        }

        const response = await got(url, {
            limitName: 'responseData',
            maxResponseSize: 5 * 1024 * 1024,
            ...getSafeGotOptions()
        });
        const dom = new JSDOM(response.body);
        let content = '';
        let selectorFound = false;

        if (css) {
            const selectorNode = dom.window.document.querySelector(css);
            if (selectorNode) {
                content = selectorNode.textContent;
                selectorFound = true;
            }
        } else {
            const headNode = dom.window.document.querySelector('head');
            content = headNode ? headNode.textContent : '';
            selectorFound = !!headNode;
        }

        content = cleanText(content);
        const hash = crypto.createHash('md5').update(content).digest('hex');

        return { content, hash, selectorFound, dom };
    }

    /**
     * Adds a new site to the monitor.
     * @param {string} url The URL of the site.
     * @param {string} css The CSS selector.
     * @param {boolean} force Whether to force adding the site even if it fails to fetch.
     * @returns {Promise<{site: object, warning: boolean}>} The added site object and warning flag.
     */
    async addSite(url, css, force = false) {
        if (!Array.isArray(this.state)) {
            this.state = [];
        }

        // Check for duplicates
        const existingSite = this.state.find(s => s.url === url && s.css === css);
        if (existingSite) {
            return { site: existingSite, warning: false };
        }

        let content = '';
        let hash = '';
        let selectorFound = false;
        let id = '';
        let fetchSuccess = false;

        try {
            const result = await this.fetchAndProcess(url, css);
            content = result.content;
            hash = result.hash;
            selectorFound = result.selectorFound;
            id = result.dom.window.document.title;
            fetchSuccess = true;
        } catch (error) {
            if (!force) {
                throw error;
            }
            console.warn(`Forcing add for ${url} despite error: ${error.message}`);
        }

        const warning = (css && fetchSuccess) ? !selectorFound : false;

        const time = new Date();
        
        if (!id || id.trim().length === 0) {
            id = new URL(url).hostname;
        }

        const site = {
            id: id,
            url: url,
            css: css,
            lastChecked: time.toISOString(),
            lastUpdated: time.toISOString(),
            hash: hash,
            lastContent: content,
        };
        
        this.state.push(site);
        await this.saveState(this.state);

        return { site, warning };
    }
    
    /**
     * Removes a site from the monitor by index.
     * @param {number} index The index of the site to remove.
     * @returns {Promise<object|null>} The removed site object, or null if invalid index.
     */
    async removeSiteByIndex(index) {
        if (!Array.isArray(this.state) || index < 0 || index >= this.state.length) {
            return null;
        }

        const removedSite = this.state.splice(index, 1)[0];
        await this.saveState(this.state);
        return removedSite;
    }
    
    /**     * Overrides the base loadState to load from the `sites.json` file.
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

        const fields = [
            { name: `🔗 URL`, value: `${sanitizeMarkdown(site.url)}` },
            { name: `🕒 Último cambio`, value: `${formatDiscordTimestamp(site.lastUpdated)}`, inline: true }
        ];

        if (diffString) {
            fields.push({ name: '📝 Cambios detectados', value: `\`\`\`diff\n${sanitizeMarkdown(diffString.trim())}\n\`\`\`` });
        }

        const embed = new Discord.EmbedBuilder()
            .setTitle(`¡Cambio en ${sanitizeMarkdown(title.substring(0, 240))}!  🐸`)
            .addFields(fields)
            .setColor(0x6058f3);
            
        channel.send({ embeds: [embed] });
    }
}

module.exports = SiteMonitor;
