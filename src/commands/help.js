const Discord = require('discord.js');

module.exports = {
    name: 'help',
    description: 'Show all commands.',
    /**
     * Executes the help command.
     * @param {Discord.Message} message The message object.
     * @returns {void}
     */
    execute(message) {
        const embed = new Discord.MessageEmbed();
        embed.setTitle("Commands");
        embed.setColor('0x6058f3');
        embed.addField('`!help`', 'Show all commands.');
        embed.addField('`!add <URL> "<CSS SELECTOR>"`', 'Add site to monitor with optional CSS selector.');
        embed.addField('`!remove <NR>`', 'Remove site from list.');
        embed.addField('`!list | !show`', 'Show list of added sites.');
        embed.addField('`!interval`', 'Set update interval, default `5`.');
        embed.addField('`!monitor <start|stop|status|check> [monitor_name|all]`', 'Manage monitors (Site, Carrier, AppleEsim, ApplePay, AppleFeature).');
        message.channel.send(embed);
    },
};
