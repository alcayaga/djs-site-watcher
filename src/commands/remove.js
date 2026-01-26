const storage = require('../storage');

module.exports = {
    name: 'remove',
    description: 'Remove site from list.',
    execute(message, args, client, state) {
        try {
            if (args.length === 0 || isNaN(args[0])) return message.channel.send('Usage: `!remove <NR [1-99]>`');
            if (args[0] < 1 || args[0] > 99 || args[0] > state.sitesToMonitor.length) return message.channel.send('Not a valid number. Usage: `!remove <NR [1-99]>`');

            const id = state.sitesToMonitor[args[0] - 1].id;
            state.sitesToMonitor.splice(args[0] - 1, 1);
            storage.saveSites(state.sitesToMonitor);
            console.log(state.sitesToMonitor);
            message.channel.send(`Removed **${id}** from list.`);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
