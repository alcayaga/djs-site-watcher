const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove site from list.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption(option =>
            option.setName('index')
                .setDescription('The number of the site to remove (from /list)')
                .setRequired(true)
                .setMinValue(1)),
    /**
     * Executes the remove command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The config object.
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const index = interaction.options.getInteger('index');
        const siteMonitor = monitorManager.getMonitor('Site');

        if (!siteMonitor) {
            return interaction.reply({ content: 'Site monitor is not available.', ephemeral: true });
        }
        
        if (index > siteMonitor.state.length) {
            return interaction.reply({ content: `Not a valid number. Usage:\n/remove <index>\n(Max: ${siteMonitor.state.length})`, ephemeral: true });
        }

        const removedSite = await siteMonitor.removeSiteByIndex(index - 1);

        if (removedSite) {
            // Sync global state
            state.sitesToMonitor = siteMonitor.state;
            await interaction.reply(`Removed **${removedSite.id}** from list.`);
        } else {
            // Should be covered by the length check, but safe fallback
            return interaction.reply({ content: `Failed to remove site at index ${index}.`, ephemeral: true });
        }
    },
};