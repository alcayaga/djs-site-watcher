const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const storage = require('../storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('interval')
        .setDescription('Set update interval.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Update interval in minutes (1-60)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(60)),
    /**
     * Executes the interval command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The application state.
     * @param {object} config The configuration object.
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const newInterval = interaction.options.getInteger('minutes');

        config.interval = newInterval;
        storage.saveSettings(config);
        
        // Use MonitorManager to set intervals and start all monitors
        monitorManager.setAllIntervals(newInterval);
        monitorManager.startAll();

        await interaction.reply(`Interval set to ${config.interval} minutes.`);
    },
};