module.exports = {
    name: 'start',
    description: 'Start automatic monitoring on set interval, default `on`.',
    execute(message, args, client, state, config, cronUpdate) {
        try {
            cronUpdate.start();
            const time_ = new Date();
            console.log(`Cron started at ${time_.toLocaleString()}`);
            message.channel.send(`Started monitoring...`);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
