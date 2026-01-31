const Discord = require('discord.js');

module.exports = {
    name: 'add',
    description: 'Add site to monitor with optional CSS selector.',
    /**
     * Executes the add command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The config object.
     * @param {object} cronUpdate The cron object.
     * @param {object} monitorManager The monitor manager.
     * @returns {Promise<void>}
     */
    async execute(message, args, client, state, config, cronUpdate, monitorManager) {
        try {
            if (args.length === 0) return message.channel.send('Usage: `!add <URL> (<CSS SELECTOR>)`');
            const url = args[0];
            let selector = 'head';
            if (args[1]) {
                selector = args[1];
            }

            const siteMonitor = monitorManager.getMonitor('Site');
            if (!siteMonitor) {
                return message.reply('Site monitor is not available.');
            }

            const { site, warning } = await siteMonitor.addSite(url, selector);

            // Update local state to match the monitor's state
            // We can just push the new site since SiteMonitor.addSite handles the persistence and its own state
            // But checking for duplicates first to be safe and avoid session state desync
            const exists = state.sitesToMonitor.some(s => s.url === site.url && s.css === site.css);
            if (!exists) {
                state.sitesToMonitor.push(site);
            }
            
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