module.exports = {
    name: 'carrier',
    description: 'Manage the carrier monitor.',
    /**
     * Executes the carrier command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The configuration object.
     * @param {CronJob} cronUpdate The main cron job.
     * @param {CronJob} carrierCron The carrier cron job.
     * @returns {void}
     */
    execute(message, args, client, state, config, cronUpdate, carrierCron) {
        try {
            if (args.length === 0) return message.channel.send('Usage: `!carrier <status|start|stop>');
            const subCommand = args.shift().toLowerCase();
            switch (subCommand) {
                case 'status': {
                    const status_ = carrierCron.running ? 'running' : 'not running';
                    message.channel.send(`Carrier monitor is ${status_}.`);
                    break;
                }
                case 'start':
                    carrierCron.start();
                    message.channel.send('Carrier monitor started.');
                    break;
                case 'stop':
                    carrierCron.stop();
                    message.channel.send('Carrier monitor stopped.');
                    break;
                default:
                    message.channel.send('Invalid command... Usage: `!carrier <status|start|stop>');
            }
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
