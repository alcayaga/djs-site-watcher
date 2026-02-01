const { SlashCommandBuilder } = require('discord.js');
const storage = require('../storage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove site from list.')
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
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state) {
        try {
            const index = interaction.options.getInteger('index');
            
            if (index > state.sitesToMonitor.length) {
                return interaction.reply({ content: `Not a valid number. Usage: \
/remove <index>\n (Max: ${state.sitesToMonitor.length})`, ephemeral: true });
            }

            const id = state.sitesToMonitor[index - 1].id;
            state.sitesToMonitor.splice(index - 1, 1);
            storage.saveSites(state.sitesToMonitor);
            console.log(state.sitesToMonitor);
            
            await interaction.reply(`Removed **${id}** from list.`);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error trying to execute that command!', ephemeral: true });
        }
    },
};