const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { loadCommands } = require('../utils/commandLoader');

// Load commands once
const commands = loadCommands();

/**
 * Helper to handle errors during interaction execution.
 * @param {import('discord.js').Interaction} interaction 
 * @param {Error} error 
 */
async function handleInteractionError(interaction, error) {
    console.error(`Error handling interaction (${interaction.customId || interaction.commandName}):`, error);
    const errorMessage = { content: 'There was an error processing this interaction.', flags: [MessageFlags.Ephemeral] };
    
    if (interaction.deferred) {
        await interaction.editReply(errorMessage);
    } else if (!interaction.replied) {
        await interaction.reply(errorMessage);
    } else {
        await interaction.followUp(errorMessage);
    }
}

/**
 * Handles incoming interactions (Slash Commands, Autocomplete).
 * 
 * @param {import('discord.js').Interaction} interaction The interaction object.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {object} state The application state.
 * @param {object} config The application configuration.
 * @param {object} monitorManager The MonitorManager instance.
 * @returns {Promise<void>}
 */
async function handleInteraction(interaction, client, state, config, monitorManager) {
    // For non-ChatInput interactions (Modals, Components, Autocomplete), 
    // we must manually check permissions as setDefaultMemberPermissions only applies to the command trigger.
    if (!interaction.isChatInputCommand()) {
        const hasPermission = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);
        
        if (!hasPermission) {
            if (interaction.isAutocomplete()) return; // Silent fail for autocomplete
            return interaction.reply({ content: 'You are not authorized to use this interaction.', flags: [MessageFlags.Ephemeral] });
        }
    }

    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, client, state, config, monitorManager);
        } catch (error) {
            await handleInteractionError(interaction, error);
        }
    } else if (interaction.isModalSubmit() || interaction.isMessageComponent()) {
        const [commandName, action] = interaction.customId.split(':');
        const command = commands.get(commandName);

        if (command) {
            try {
                if (interaction.isModalSubmit()) {
                    if (typeof command.handleModal === 'function') {
                        await command.handleModal(interaction, client, state, config, monitorManager, action);
                    } else {
                        throw new Error(`Command '${commandName}' does not implement 'handleModal'.`);
                    }
                } else if (interaction.isMessageComponent()) {
                    if (typeof command.handleComponent === 'function') {
                        await command.handleComponent(interaction, client, state, config, monitorManager, action);
                    } else {
                        throw new Error(`Command '${commandName}' does not implement 'handleComponent'.`);
                    }
                }
            } catch (error) {
                await handleInteractionError(interaction, error);
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
