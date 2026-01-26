const Discord = require('discord.js');

module.exports = {
    name: 'list',
    description: 'Show list of added sites.',
    execute(message, args, client, state) {
        try {
            if (state.sitesToMonitor.length < 1) return message.channel.send('No sites to monitor. Add one with `!add`.');

            const embed_ = new Discord.MessageEmbed();
            for (let i = 0; i < state.sitesToMonitor.length; i++) {
                embed_.setTitle(`${state.sitesToMonitor.length} sitio(s) están siendo monitoreados:`);
                embed_.addField(`${state.sitesToMonitor[i].id}`, `URL: ${state.sitesToMonitor[i].url}\nCSS: `${state.sitesToMonitor[i].css}`\nChecked: ${state.sitesToMonitor[i].lastChecked}\nUpdated: ${state.sitesToMonitor[i].lastUpdated}\nRemove: `!remove ${i + 1}``);
                embed_.setColor('0x6058f3');
            }
            message.channel.send(embed_);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};