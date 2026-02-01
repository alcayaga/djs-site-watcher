const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const crypto = require('crypto');
const diff = require('diff');
const got = require('got');
const storage = require('../storage');
const dns = require('dns');
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

/**
 * Checks if an IP address is private.
 * @param {string} ip The IP address.
 * @returns {boolean} True if private, false otherwise.
 */
function isPrivateIP(ip) {
    // Handle IPv4-mapped IPv6 addresses
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    const parts = ip.split('.');
    if (parts.length === 4) { // IPv4
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        
        // 0.0.0.0/8 (Current network)
        if (p0 === 0) return true;
        // 10.0.0.0/8 (Private)
        if (p0 === 10) return true;
        // 100.64.0.0/10 (Shared Address Space / CGNAT)
        if (p0 === 100 && (p1 >= 64 && p1 <= 127)) return true;
        // 127.0.0.0/8 (Loopback)
        if (p0 === 127) return true;
        // 169.254.0.0/16 (Link-local)
        if (p0 === 169 && p1 === 254) return true;
        // 172.16.0.0/12 (Private)
        if (p0 === 172 && (p1 >= 16 && p1 <= 31)) return true;
        // 192.0.0.0/24 (IETF Protocol Assignments)
        if (p0 === 192 && p1 === 0 && parseInt(parts[2], 10) === 0) return true;
         // 192.0.2.0/24 (TEST-NET-1)
        if (p0 === 192 && p1 === 0 && parseInt(parts[2], 10) === 2) return true;
        // 192.88.99.0/24 (6to4 Relay Anycast)
        if (p0 === 192 && p1 === 88 && parseInt(parts[2], 10) === 99) return true;
        // 192.168.0.0/16 (Private)
        if (p0 === 192 && p1 === 168) return true;
        // 198.18.0.0/15 (Network Benchmark)
        if (p0 === 198 && (p1 >= 18 && p1 <= 19)) return true;
         // 198.51.100.0/24 (TEST-NET-2)
        if (p0 === 198 && p1 === 51 && parseInt(parts[2], 10) === 100) return true;
        // 203.0.113.0/24 (TEST-NET-3)
        if (p0 === 203 && p1 === 0 && parseInt(parts[2], 10) === 113) return true;
        // 224.0.0.0/4 (Multicast)
        if (p0 >= 224 && p0 <= 239) return true;
        // 240.0.0.0/4 (Reserved)
        if (p0 >= 240) return true;
        // 255.255.255.255 (Broadcast)
        if (ip === '255.255.255.255') return true;
        
        return false;
    }
    
    // IPv6 checks
    // Loopback
    if (ip === '::1') return true;
    // Unspecified
    if (ip === '::') return true;
    // Unique Local Address (fc00::/7) - fc.. or fd..
    if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
    // Link-Local (fe80::/10) - fe8, fe9, fea, feb
    if (ip.toLowerCase().startsWith('fe8') || ip.toLowerCase().startsWith('fe9') || ip.toLowerCase().startsWith('fea') || ip.toLowerCase().startsWith('feb')) return true;
    // IPv4-compatible IPv6 (deprecated, but safe to block) ::0.0.0.0
    if (ip.startsWith('::') && ip.includes('.')) return true;
    
    return false;
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
            /**
             * Custom DNS lookup to prevent access to private IP addresses.
             * @param {string} hostname The hostname to lookup.
             * @param {object} options The lookup options.
             * @param {function} callback The callback function.
             */
            dnsLookup: (hostname, options, callback) => {
                dns.lookup(hostname, options, (err, address, family) => {
                    if (err) return callback(err);
                    if (isPrivateIP(address)) {
                        return callback(new Error('Private IP access denied'));
                    }
                    callback(null, address, family);
                });
            }
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
        let id;
        try {
            id = new URL(url).hostname;
        } catch {
            id = url.split('/')[2];
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

        const embed = new Discord.EmbedBuilder()
            .setTitle(`🔎 ¡Cambio en ${title.substring(0, 240)}!  🐸`)
            .addFields([
                { name: `URL`, value: `${site.url}` },
                { name: `Último cambio`, value: `${site.lastUpdated}`, inline: true },
                { name: `Actualizado`, value: `${site.lastUpdated}`, inline: true }
            ])
            .setColor(0x6058f3);
            
        channel.send({ embeds: [embed] });
        channel.send({ content: ` \n${diffString}\n `, allowedMentions: { parse: [] } });
    }
}

module.exports = SiteMonitor;
