const { loadCommands } = require('../utils/commandLoader');

// Load commands once
const commands = loadCommands();

/**
 * Handles incoming interactions (Slash Commands, Autocomplete).
 * 
 * @param {import('discord.js').Interaction} interaction The interaction object.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {object} state The application state.
 * @param {object} config The application configuration.
 * @param {object} monitorManager The MonitorManager instance.
 */
async function handleInteraction(interaction, client, state, config, monitorManager) {
    // Authorization Check
    const isAuthorized = interaction.channelId === config.DISCORDJS_ADMINCHANNEL_ID && 
                         interaction.member && 
                         interaction.member.roles.cache.has(config.DISCORDJS_ROLE_ID);

    if (!isAuthorized) {
        if (interaction.isChatInputCommand()) {
            await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client, state, config, monitorManager);
        } catch (error) {
            console.error(error);
            const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };
            
            if (interaction.replied) {
                await interaction.followUp(errorMessage);
            } else if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    } else if (interaction.isModalSubmit() || interaction.isMessageComponent()) {
        const [commandName, action] = interaction.customId.split(':');
        const command = commands.get(commandName);

        if (command) {
            try {
                if (interaction.isModalSubmit() && typeof command.handleModal === 'function') {
                    await command.handleModal(interaction, client, state, config, monitorManager, action);
                } else if (interaction.isMessageComponent() && typeof command.handleComponent === 'function') {
                    await command.handleComponent(interaction, client, state, config, monitorManager, action);
                }
            } catch (error) {
                console.error(`Error handling interaction (${interaction.customId}):`, error);
                const errorMessage = { content: 'There was an error processing this interaction.', ephemeral: true };
                
                if (interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply(errorMessage);
                } else {
                    await interaction.followUp(errorMessage);
                }
            }
        }
    } else if (interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.autocomplete(interaction, monitorManager);
        } catch (error) {
            console.error(error);
        }
    }
}

module.exports = { handleInteraction, commands };
