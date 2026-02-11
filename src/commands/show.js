const { SlashCommandBuilder } = require('discord.js');
const listCommand = require('./list');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show')
        .setDescription('Show list of added sites (alias for /list).'),
    /**
     * Executes the show command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The config object.
     * @param {import('../MonitorManager')} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        await listCommand.execute(interaction, client, state, config, monitorManager);
    },
};