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
        const embed = new Discord.EmbedBuilder();
        embed.setTitle("Commands");
        embed.setColor('0x6058f3');
        embed.addFields([
            { name: '`!help`', value: 'Show all commands.' },
            { name: '`!add <URL> "<CSS SELECTOR>"`', value: 'Add site to monitor with optional CSS selector.' },
            { name: '`!remove <NR>`', value: 'Remove site from list.' },
            { name: '`!list | !show`', value: 'Show list of added sites.' },
            { name: '`!interval`', value: 'Set update interval, default `5`.' },
            { name: '`!monitor <start|stop|status|check> [monitor_name|all]`', value: 'Manage monitors (Site, Carrier, AppleEsim, ApplePay, AppleFeature).' }
        ]);
        message.channel.send({ embeds: [embed] });
    },
};
