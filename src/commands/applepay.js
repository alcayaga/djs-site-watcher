module.exports = {
    name: 'applepay',
    description: 'Manage the Apple Pay monitor.',
    execute(message, args, client, state, config, cronUpdate, carrierCron, appleFeatureCron, applePayCron) {
        try {
            if (args.length === 0) return message.channel.send('Usage: `!applepay <status|start|stop>');
            const subCommand = args.shift().toLowerCase();
            switch (subCommand) {
                case 'status':
                    const status_ = applePayCron.running ? 'running' : 'not running';
                    message.channel.send(`Apple Pay monitor is ${status_}.`);
                    break;
                case 'start':
                    applePayCron.start();
                    message.channel.send('Apple Pay monitor started.');
                    break;
                case 'stop':
                    applePayCron.stop();
                    message.channel.send('Apple Pay monitor stopped.');
                    break;
                default:
                    message.channel.send('Invalid command... Usage: `!applepay <status|start|stop>');
            }
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
