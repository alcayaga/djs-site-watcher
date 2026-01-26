const Discord = require('discord.js');

module.exports = {
    name: 'list',
    description: 'Show list of added sites.',
    /**
     * Executes the list command.
     *
     * @param {Discord.Message} message The message object that triggered the command.
     * @param {string[]} args The arguments passed to the command.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state of the bot.
     * @returns {Promise<void>}
     */
    execute(message, args, client, state) {
        try {
            if (state.sitesToMonitor.length < 1) return message.channel.send('No sites to monitor. Add one with `!add`.');

            const embed_ = new Discord.MessageEmbed();
            embed_.setTitle(`${state.sitesToMonitor.length} sitio(s) están siendo monitoreados:`);
            embed_.setColor('0x6058f3');

            for (let i = 0; i < state.sitesToMonitor.length; i++) {
                const site = state.sitesToMonitor[i];
                const field = `URL: ${site.url}\nCSS: \`${site.css}\`\nChecked: ${site.lastChecked}\nUpdated: ${site.lastUpdated}\nRemove: \`!remove ${i + 1}\``;
                embed_.addField(site.id, field);
            }
            message.channel.send(embed_);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};