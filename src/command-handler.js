const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load all commands from the commands directory
const commands = new Discord.Collection();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js') && !file.endsWith('.test.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.set(command.name, command);
}

const PREFIX = '!';
const regexp = /[^\s"]+|"([^"]*)"/gi;


/**
 * Handles incoming commands from Discord messages.
 *
 * @param {Discord.Message} message The message object from Discord.
 * @param {Discord.Client} client The Discord client instance.
 * @param {object} state The application state.
 * @param {object} config The application configuration.
 * @param {object} cronUpdate The cron job for updating sites.
 * @param {object} monitorManager The MonitorManager instance.
 */
async function handleCommand(message, client, state, config, cronUpdate, monitorManager) {
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
    
    // Command handling
    if (!message.content.startsWith(PREFIX) || message.author.bot || config.DISCORDJS_ADMINCHANNEL_ID !== message.channel.id || !message.member.roles.cache.has(config.DISCORDJS_ROLE_ID)) return;
    
    // Parse arguments
    const args = [];
    const argsTemp = message.content.slice(PREFIX.length).trim();
    let match;
    do {
        match = regexp.exec(argsTemp);
        if (match != null) {
            args.push(match[1] ? match[1] : match[0]);
        }
    } while (match != null);
    
    // Get command and aliases
    const commandName = args.shift().toLowerCase();
    const command = commands.get(commandName) || commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) {
        message.channel.send('Invalid command...\nType `!help` for a list of commands.');
        return;
    }

    // Execute command
    try {
        command.execute(message, args, client, state, config, cronUpdate, monitorManager);
    } catch (error) {
        console.error(error);
        message.reply('there was an error trying to execute that command!');
    }
}

module.exports = { handleCommand, commands };
