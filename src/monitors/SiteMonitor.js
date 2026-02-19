const { JSDOM } = require('jsdom');
const Discord = require('discord.js');
const Monitor = require('../Monitor');
const crypto = require('crypto');
const diff = require('diff');
const got = require('got');
const storage = require('../storage');
const { URL } = require('url');
const { getSafeGotOptions } = require('../utils/network');
const logger = require('../utils/logger');

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
        logger.info('Checking for %s updates...', this.name);
        let sitesArray = Array.isArray(this.state) ? this.state : [];

        const checkPromises = sitesArray.map(async (site) => {
            let hasChanged = false;
            try {
                const { content, hash, dom } = await this.fetchAndProcess(site.url, site.css);

                const title = dom.window.document.title;
                if (title && title.trim().length > 0 && site.id !== title) {
                    logger.info('[Migration] Updating ID for %s from \'%s\' to \'%s\'', site.url, site.id, title);
                    site.id = title;
                    hasChanged = true;
                }

                if (site.hash !== hash) {
                    const oldContent = site.lastContent || '';
                    const cleanOldContent = cleanText(oldContent);
                    
                    site.lastChecked = new Date().toISOString();
                    site.lastUpdated = new Date().toISOString();
                    site.hash = hash;
                    site.lastContent = content;
                    
                    if (cleanOldContent !== content) {
                        hasChanged = true;
                        this.notify({ site, oldContent, newContent: content, dom });
                    } else {
                        // Silent update (Migration to clean content)
                        hasChanged = true; 
                        logger.info('[Migration] Updated %s to clean content format without notification.', site.url);
                    }
                } else {
                    if (site.lastContent === undefined) {
                        site.lastContent = content;
                        hasChanged = true;
                        logger.info('[Migration] Backfilled lastContent for %s without notification.', site.url);
                    }
                    site.lastChecked = new Date().toISOString();
                }
                return { site, hasChanged };
            } catch (err) {
                logger.error('%s :', site.url, err);
                return { site, hasChanged: false };
            }
        });

        const results = await Promise.all(checkPromises);
        const hasAnyChanges = results.some(r => r.hasChanged);

        if (hasAnyChanges) {
            const updatedSites = results.map(r => r.site);
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
     * @param {string|null} guildId The ID of the guild where the site was added.
     * @returns {Promise<{site: object, warning: boolean}>} The added site object and warning flag.
     */
    async addSite(url, css, force = false, guildId = null) {
        if (!Array.isArray(this.state)) {
            this.state = [];
        }

        // Check for duplicates within the same guild
        const existingSite = this.state.find(s => 
            s.url === url && 
            s.css === css && 
            (s.guildId || null) === (guildId || null)
        );
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
            logger.warn('Forcing add for %s despite error: %s', url, error.message);
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
            guildId: guildId,
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
            logger.info('Could not load state for %s from %s. Starting fresh.', this.name, this.config.file);
            return [];
        }
    }

    /**
     * Sends a notification for a changed site.
     * @param {object} change The change object containing site, old/new content, and dom.
     * @returns {Promise<void>}
     */
    async notify(change) {
        const { site, oldContent, newContent, dom } = change;
        const channel = this.getNotificationChannel();
        if (!channel) {
            logger.error('Notification channel not found for %s.', this.name);
            return;
        }

        logger.info('Change detected! %s', site.url);
        
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

        if (diffString.length > 950) {
            diffString = diffString.substring(0, 950) + '\n... (truncado)';
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
            
        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            if (error.code === Discord.RESTJSONErrorCodes.MissingPermissions) { // Missing Permissions
                logger.warn('[SiteMonitor] Missing permissions to send embed in %s (%s). Trying fallback message.', channel.name, channel.id);
                try {
                    await channel.send(`¡Cambio detectado en ${sanitizeMarkdown(title)}! 🐸\n${sanitizeMarkdown(site.url)}\n(No tengo permisos para enviar embeds en este canal)`);
                } catch (fallbackError) {
                    if (fallbackError.code === Discord.RESTJSONErrorCodes.MissingPermissions) {
                        logger.error('[SiteMonitor] CRITICAL: Missing \'Send Messages\' permission in %s (%s). Cannot send ANY notification.', channel.name, channel.id, fallbackError);
                    } else {
                        logger.error('[SiteMonitor] Failed to send fallback message in %s (%s):', channel.name, channel.id, fallbackError);
                    }
                }
            } else {
                throw error;
            }
        }
    }
}

module.exports = SiteMonitor;
