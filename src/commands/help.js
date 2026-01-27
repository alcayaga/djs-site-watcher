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
        embed.addField('`!update`', 'Manually update sites.');
        embed.addField('`!interval`', 'Set update interval, default `5`.');
        embed.addField('`!start`', 'Start automatic monitoring on set interval, default `on`.');
        embed.addField('`!stop`', 'Stop monitoring.');
        embed.addField('`!status`', 'Show monitoring status.');
        embed.addField('`!carrier <status|start|stop>`', 'Manage the carrier monitor.');
        embed.addField('`!esim <status|start|stop>`', 'Manage the eSIM monitor.');
        embed.addField('`!applepay <status|start|stop>`', 'Manage the Apple Pay monitor.');
        embed.addField('`!applefeature <status|start|stop>`', 'Manage the Apple Feature monitor.');
        message.channel.send(embed);
    },
};
