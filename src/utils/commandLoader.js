const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

/**
 * Loads commands from the commands directory.
 * @returns {Collection} A collection of commands.
 */
function loadCommands() {
    const commands = new Collection();
    const commandsPath = path.join(__dirname, '..', 'commands');
    
    if (!fs.existsSync(commandsPath)) {
        return commands;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && !file.endsWith('.test.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    return commands;
}

module.exports = { loadCommands };
