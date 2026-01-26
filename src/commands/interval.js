const storage = require('../storage');
const { CronTime } = require('cron');

module.exports = {
    name: 'interval',
    description: 'Set update interval, default `5`.',
    execute(message, args, client, state, config, cronUpdate, carrierCron, appleFeatureCron, applePayCron, appleEsimCron) {
        try {
            if (args.length === 0 || isNaN(args[0]) || args[0] < 1 || args[0] > 60) return message.channel.send('Usage: `!interval <MINUTES [1-60]>`');
            
            if (Math.round(args[0]) < 60) {
                cronUpdate.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
            } else {
                cronUpdate.setTime(new CronTime(`0 0 * * * *`));
            }
            config.interval = Math.round(args[0]);
            storage.saveSettings(config);
            message.channel.send(`Interval set to 
${config.interval}
 minutes.`);
            cronUpdate.start();

            if (Math.round(args[0]) < 60) {
                carrierCron.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
                appleFeatureCron.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
                applePayCron.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
                appleEsimCron.setTime(new CronTime(`0 */${Math.round(args[0])} * * * *`));
            } else {
                carrierCron.setTime(new CronTime(`0 0 * * * *`));
                appleFeatureCron.setTime(new CronTime(`0 0 * * * *`));
                applePayCron.setTime(new CronTime(`0 0 * * * *`));
                appleEsimCron.setTime(new CronTime(`0 0 * * * *`));
            }
            carrierCron.start();
            appleFeatureCron.start();
            applePayCron.start();
            appleEsimCron.start();
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
