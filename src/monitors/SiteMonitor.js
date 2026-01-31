const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const crypto = require('crypto');
const diff = require('diff');
const got = require('got');
const storage = require('../storage');
const dns = require('dns').promises;
const { URL } = require('url');

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
                    if (site.lastContent === undefined) {
                        site.lastContent = content;
                        hasChanges = true;
                        console.log(`[Migration] Backfilled lastContent for ${site.url} without notification.`);
                    }
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
     * Validates the URL to prevent SSRF and ensure it's http/https.
     * @param {string} url The URL to validate.
     * @returns {Promise<void>} Throws if invalid.
     */
    async validateUrl(url) {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (e) {
            throw new Error('Invalid URL format');
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Invalid protocol. Only http and https are allowed.');
        }

        const hostname = parsedUrl.hostname;

        // Check for private IP ranges (IPv4)
        try {
            const { address } = await dns.lookup(hostname);
            
            const parts = address.split('.').map(Number);
            if (parts.length === 4) {
                // 10.0.0.0/8
                if (parts[0] === 10) throw new Error('Private IP access denied');
                // 172.16.0.0/12
                if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) throw new Error('Private IP access denied');
                // 192.168.0.0/16
                if (parts[0] === 192 && parts[1] === 168) throw new Error('Private IP access denied');
                // 127.0.0.0/8
                if (parts[0] === 127) throw new Error('Private IP access denied');
                // 169.254.0.0/16
                if (parts[0] === 169 && parts[1] === 254) throw new Error('Private IP access denied');
            }
        } catch (error) {
             // Re-throw if it's our access denied error, otherwise wrap or allow if strictness varies.
             // Here we block on lookup failure for safety.
             if (error.message === 'Private IP access denied') throw error;
             // We allow lookup errors to pass if it's just resolution failure? 
             // No, if we can't resolve, got will fail anyway. But if we can't resolve to check IP, we shouldn't proceed if we are strict.
             // However, let's just let the access denied error bubble up.
             throw error; 
        }
    }

    /**
     * Fetches and processes the content of a site.
     * @param {string} url The URL to fetch.
     * @param {string} css The CSS selector to use.
     * @returns {Promise<{content: string, hash: string, dom: JSDOM, selectorFound: boolean}>} The processed content.
     */
    async fetchAndProcess(url, css) {
        await this.validateUrl(url);

        // Limit response size to 5MB to prevent DoS
        const response = await got(url, { limitName: 'responseData', maxResponseSize: 5 * 1024 * 1024 });
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

        return { content, hash, dom, selectorFound };
    }

    /**
     * Adds a new site to the monitor.
     * @param {string} url The URL of the site.
     * @param {string} css The CSS selector.
     * @returns {Promise<{site: object, warning: boolean}>} The added site object and warning flag.
     */
    async addSite(url, css) {
        if (!Array.isArray(this.state)) {
            this.state = [];
        }

        // Check for duplicates
        const existingSite = this.state.find(s => s.url === url && s.css === css);
        if (existingSite) {
            return { site: existingSite, warning: false };
        }

        const { content, hash, selectorFound } = await this.fetchAndProcess(url, css);
        const warning = css ? !selectorFound : false;

        const time = new Date();
        const site = {
            id: url.split('/')[2],
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
