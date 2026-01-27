const Discord = require('discord.js');
const got = require('got');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');
const storage = require('../storage');

module.exports = {
    name: 'add',
    description: 'Add site to monitor with optional CSS selector.',
    /**
     * Executes the add command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @returns {Promise<void>}
     */
    async execute(message, args, client, state) {
        try {
            if (args.length === 0) return message.channel.send('Usage: `!add <URL> (<CSS SELECTOR>)`');
            const url = args[0];
            let selector = 'head';
            let content_;
            if (args[1]) {
                selector = args[1];
            }

            const site = {
                id: url.split('/')[2],
                url: url,
                css: selector,
                lastChecked: 0,
                lastUpdated: 0,
                hash: 0,
                lastContent: '',
            };

            const response = await got(site.url);
            const dom = new JSDOM(response.body);
            let warning = false;

            if (site.css) {
                const selector_ = dom.window.document.querySelector(site.css);
                if (selector_) {
                    content_ = selector_.textContent;
                } else {
                    content_ = '';
                    warning = true;
                }
            } else {
                content_ = dom.window.document.querySelector('head').textContent;
            }

            console.log(content_);
            const hash = crypto.createHash('md5').update(content_).digest('hex');
            const time = new Date();
            site.lastChecked = time.toLocaleString();
            site.lastUpdated = time.toLocaleString();
            site.hash = hash;
            site.lastContent = content_;

            state.sitesToMonitor.push(site);
            console.log(state.sitesToMonitor);
            storage.saveSites(state.sitesToMonitor);

            let warning_message = '';
            if (warning) {
                warning_message = '\n**Atención:** No se encontró el selector CSS solicitado'
            }

            const embed = new Discord.MessageEmbed();
            embed.addField(`Monitoreando ahora:`, `Dominio: ${site.id}\nURL: ${site.url}\nCSS: 
${site.css}${warning_message}`);
            embed.setColor('0x6058f3');
            message.channel.send(embed);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};