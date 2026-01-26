module.exports = {
    name: 'esim',
    description: 'Manage the eSIM monitor.',
    execute(message, args, client, state, config, cronUpdate, carrierCron, appleFeatureCron, applePayCron, appleEsimCron) {
        try {
            if (args.length === 0) return message.channel.send('Usage: `!esim <status|start|stop>');
            const subCommand = args.shift().toLowerCase();
            switch (subCommand) {
                case 'status':
                    const status_ = appleEsimCron.running ? 'running' : 'not running';
                    message.channel.send(`eSIM monitor is ${status_}.`);
                    break;
                case 'start':
                    appleEsimCron.start();
                    message.channel.send('eSIM monitor started.');
                    break;
                case 'stop':
                    appleEsimCron.stop();
                    message.channel.send('eSIM monitor stopped.');
                    break;
                default:
                    message.channel.send('Invalid command... Usage: `!esim <status|start|stop>');
            }
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
