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
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state) {
        try {
            await listCommand.execute(interaction, client, state);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error trying to execute that command!', ephemeral: true });
        }
    },
};