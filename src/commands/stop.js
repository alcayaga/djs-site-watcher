module.exports = {
    name: 'stop',
    description: 'Stop monitoring.',
    /**
     * Executes the stop command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The configuration object.
     * @param {CronJob} cronUpdate The main cron job.
     * @returns {void}
     */
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
