const storage = require('../storage');
const { CronTime } = require('cron');

module.exports = {
    name: 'interval',
    description: 'Set update interval, default `5`.',
    /**
     * Executes the interval command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The configuration object.
     * @param {CronJob} cronUpdate The main cron job.
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {void}
     */
    execute(message, args, client, state, config, cronUpdate, monitorManager) {
        try {
            if (args.length === 0 || isNaN(args[0]) || args[0] < 1 || args[0] > 60) return message.channel.send('Usage: `!interval <MINUTES [1-60]>`');
            
            const newInterval = Math.round(args[0]);

            config.interval = newInterval;
            storage.saveSettings(config);
            message.channel.send(`Interval set to ${config.interval} minutes.`);

            // Use MonitorManager to set intervals and start all monitors
            monitorManager.setAllIntervals(newInterval);
            monitorManager.startAll();

        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
