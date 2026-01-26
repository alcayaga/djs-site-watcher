const listCommand = require('./list');

module.exports = {
    name: 'show',
    description: 'Show list of added sites.',
    execute(message, args, client, state) {
        try {
            listCommand.execute(message, args, client, state);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
