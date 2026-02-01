const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands.'),
    /**
     * Executes the help command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const embed = new EmbedBuilder();
        embed.setTitle("Commands");
        embed.setColor(0x6058f3);
        embed.addFields([
            { name: '`/help`', value: 'Show all commands.' },
            { name: '`/add <url> [selector]`', value: 'Add site to monitor with optional CSS selector.' },
            { name: '`/remove <index>`', value: 'Remove site from list.' },
            { name: '`/list`', value: 'Show list of added sites.' },
            { name: '`/interval <minutes>`', value: 'Set update interval, default `5`.' },
            { name: '`/monitor <subcommand> [name]`', value: 'Manage monitors (start, stop, status, check).' }
        ]);
        await interaction.reply({ embeds: [embed] });
    },
};