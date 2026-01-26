module.exports = {
    name: 'stop',
    description: 'Stop monitoring.',
    execute(message, args, client, state, config, cronUpdate) {
        try {
            cronUpdate.stop();
            const time_ = new Date();
            console.log(`Cron stopped at ${time_.toLocaleString()}`);
            message.channel.send('Paused website monitoring... Type `!start` to resume.');
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
