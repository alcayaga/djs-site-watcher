const { REST, Routes } = require('discord.js');
const config = require('./config');
const { loadCommands } = require('./utils/commandLoader');

const commands = loadCommands();
const commandData = commands.map(command => command.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.DISCORDJS_BOT_TOKEN);

(async () => {
	try {
		console.log(`Started refreshing ${commandData.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        // If we want global commands, we use Routes.applicationCommands(clientId)
        // Since config has DISCORDJS_CLIENT_ID, we use it.
        // Assuming global commands for now as per previous bot.js implementation (client.application.commands.set)
        
        if (!config.DISCORDJS_CLIENT_ID) {
            throw new Error('DISCORDJS_CLIENT_ID is missing in configuration.');
        }

		const data = await rest.put(
			Routes.applicationCommands(config.DISCORDJS_CLIENT_ID),
			{ body: commandData },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();
