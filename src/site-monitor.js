const got = require('got');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');
const diff = require('diff');
const storage = require('./storage.js');
const Discord = require('discord.js');

const forcedSite = 'deadbeefdeadbeefdeadbeefdeadbeef';

/**
 * Checks all monitored websites for changes.
 * It fetches the content of each site, generates an MD5 hash of the content,
 * and compares it with the previously stored hash. If the hashes differ,
 * it generates a diff and sends a notification to the specified Discord channel.
 *
 * @param {Discord.Client} clientInstance The active Discord client instance.
 * @param {Array<object>} sitesArray An array of site objects to monitor.
 * @param {Discord.Channel} channelInstance The Discord channel to send notifications to.
 */
async function checkSites(clientInstance, sitesArray, channelInstance) {
    console.log('Checking for websites updates...');

    let channel = channelInstance;
    const changedSitesDetails = []; // To store details of all changed sites

    const checkPromises = sitesArray.map(async (site, index) => {
        try {
            // Fetch the website's content
            const response = await got(site.url);
            const dom = new JSDOM(response.body);
            let content_ = '';

            // Extract text content using the specified CSS selector, or from the <head> if no selector is provided.
            if (site.css) {
                const selector_ = dom.window.document.querySelector(site.css);
                content_ = selector_ ? selector_.textContent : '';
            } else {
                content_ = dom.window.document.querySelector('head').textContent;
            }

            // Generate an MD5 hash of the content for efficient change detection.
            const hash = crypto.createHash('md5').update(content_).digest('hex');

            // If the new hash is different from the old one, the site has changed.
            if (site.hash !== hash) {
                const oldContent = site.lastContent || ''; // Capture old content before updating, defaulting to empty string

                // Update site data with the new hash and content
                site.lastChecked = new Date().toLocaleString();
                site.lastUpdated = new Date().toLocaleString();
                site.hash = hash;
                site.lastContent = content_;

                return { changed: true, index, oldContent, newContent: content_, dom };
            } else {
                site.lastChecked = new Date().toLocaleString(); // Update last checked even if no change
                return { changed: false };
            }
        } catch (err) {
            if (site.hash !== forcedSite) {
                console.log(`${site.url} : ${err}`);
            }
            return { changed: false }; // Return false on error
        }
    });

    const results = await Promise.all(checkPromises);

    // Filter out sites that actually changed
    results.forEach(result => {
        if (result.changed) {
            changedSitesDetails.push(result);
        }
    });

    // If any sites have changed, send a single "changes detected" message.
    if (changedSitesDetails.length > 0) {
        channel.send("Detecté cambios"); // Send this once at the beginning of detected changes
    }

    // Process and send a notification for each changed site.
    for (const { index, oldContent, newContent, dom } of changedSitesDetails) {
        console.log(`Change detected! ${sitesArray[index].url}`);
        console.log(newContent);

        var title = dom.window.document.title;
        if (title === "") {
            title = sitesArray[index].id;
        }

        // Generate a line-by-line diff of the content.
        const changes = diff.diffLines(oldContent, newContent);
        let diffString = '';
        changes.forEach((part) => {
            const prefix = part.added ? '🟢' : part.removed ? '🔴' : '⚪';
            if ((!part.added && !part.removed) && diffString.length >= 1800) {
                return;
            }

            if (!part.value) return;

            // Prefix each line of the diff with an emoji to indicate the change type.
            // This handles multiline parts correctly.
            const endsWithNewline = part.value.endsWith('\n');
            const valueToProcess = endsWithNewline ? part.value.slice(0, -1) : part.value;

            const prefixedLines = valueToProcess.split('\n').map(line => prefix + line).join('\n');

            diffString += prefixedLines;

            if (endsWithNewline) {
                diffString += '\n';
            }
        });

        // Truncate the diff string if it's too long for a Discord message.
        if (diffString.length > 1900) {
            diffString = diffString.substring(0, 1900) + '\n... (truncated)';
        }

        // Create and send an embed with details about the change.
        var embed = new Discord.MessageEmbed();
        embed.setTitle(`🔎 ¡Cambio en ${title}!  🐸`);
        embed.addField(`URL`, `${sitesArray[index].url}`);
        embed.addField(`Último cambio`, `${sitesArray[index].lastUpdated}`, true);
        embed.addField(`Actualizado`, `${sitesArray[index].lastUpdated}`, true);
        embed.setColor('0x6058f3');
        channel.send(embed);
        // Send the formatted diff in a code block.
        channel.send(`\`\`\`diff\n${diffString}\n\`\`\``);
    }

    // Save the updated site data back to the JSON file.
    if (changedSitesDetails.length > 0) {
        storage.saveSites(sitesArray);
    }
}

module.exports = { checkSites };
