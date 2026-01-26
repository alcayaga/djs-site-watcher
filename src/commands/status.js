module.exports = {
    name: 'status',
    description: 'Show monitoring status.',
    execute(message, args, client, state, config, cronUpdate) {
        try {
            console.log('Status: ', cronUpdate.running);
            if (cronUpdate.running) message.channel.send(`Site Watcher is running with an interval of \`${config.interval}\` minute(s).`);
            else message.channel.send('Site Watcher is not running. Use `!start` to start monitoring websites.');
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
