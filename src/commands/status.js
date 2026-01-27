module.exports = {
    name: 'status',
    description: 'Show monitoring status.',
    /**
     * Executes the status command.
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
            console.log('Status: ', cronUpdate.running);
            if (cronUpdate.running) message.channel.send(`Site Watcher is running with an interval of \`${config.interval}\` minute(s).`);
            else message.channel.send('Site Watcher is not running. Use `!start` to start monitoring websites.');
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
