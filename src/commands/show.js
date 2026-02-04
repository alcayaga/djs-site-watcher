const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const listCommand = require('./list');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('show')
        .setDescription('Show list of added sites (alias for /list).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    /**
     * Executes the show command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state) {
        await listCommand.execute(interaction, client, state);
    },
};