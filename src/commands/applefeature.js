module.exports = {
    name: 'applefeature',
    description: 'Manage the Apple Feature monitor.',
    execute(message, args, client, state, config, cronUpdate, carrierCron, appleFeatureCron) {
        try {
            if (args.length === 0) return message.channel.send('Usage: `!applefeature <status|start|stop>');
            const subCommand = args.shift().toLowerCase();
            switch (subCommand) {
                case 'status':
                    const status_ = appleFeatureCron.running ? 'running' : 'not running';
                    message.channel.send(`Apple Feature monitor is ${status_}.`);
                    break;
                case 'start':
                    appleFeatureCron.start();
                    message.channel.send('Apple Feature monitor started.');
                    break;
                case 'stop':
                    appleFeatureCron.stop();
                    message.channel.send('Apple Feature monitor stopped.');
                    break;
                default:
                    message.channel.send('Invalid command... Usage: `!applefeature <status|start|stop>');
            }
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
