module.exports = {
    name: 'start',
    description: 'Start automatic monitoring on set interval, default `on`.',
    /**
     * Executes the start command.
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
