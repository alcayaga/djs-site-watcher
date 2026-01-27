const listCommand = require('./list');

module.exports = {
    name: 'show',
    description: 'Show list of added sites.',
    /**
     * Executes the show command, which is an alias for the list command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @returns {void}
     */
    execute(message, args, client, state) {
        try {
            listCommand.execute(message, args, client, state);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
