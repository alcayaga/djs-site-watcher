const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load all commands from the commands directory
const commands = new Discord.Collection();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js') && !file.endsWith('.test.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.set(command.data.name, command);
}

/**
 * Handles incoming interactions (Slash Commands, Autocomplete).
 * 
 * @param {import('discord.js').Interaction} interaction The interaction object.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {object} state The application state.
 * @param {object} config The application configuration.
 * @param {object} cronUpdate The cron job for updating sites.
 * @param {object} monitorManager The MonitorManager instance.
 */
async function handleInteraction(interaction, client, state, config, cronUpdate, monitorManager) {
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
            await command.execute(interaction, client, state, config, cronUpdate, monitorManager);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
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

/**
 * Handles incoming messages for auto-responses.
 *
 * @param {Discord.Message} message The message object from Discord.
 * @param {object} state The application state.
 * @param {object} config The application configuration.
 */
async function handleMessage(message, state, config) {
    // AP Channel auto-responses
    if (!message.author.bot && config.DISCORDJS_APCHANNEL_ID === message.channel.id) {
        const ap_message = message.content.trim();

        for (const response of state.responses) {
            const ap_match = response.trigger_regex.exec(ap_message);
            if (ap_match != null) {
                message.channel.sendTyping();

                // Wait 5 seconds before sending the response
                await new Promise(resolve => setTimeout(resolve, 5000));

                const reply_id = Math.floor(Math.random() * response.replies.length);
                const reply = response.replies[reply_id];

                if (reply.img_response !== "") {
                    const img = new Discord.AttachmentBuilder(reply.img_response);
                    message.channel.send({ files: [img] });
                }

                if (reply.text_response !== "") {
                    message.reply(reply.text_response);
                }

                return;
            }
        }
    }
}

module.exports = { handleInteraction, handleMessage, commands };