module.exports = {
    name: 'monitor',
    description: 'Manage individual or all monitors (start, stop, status, check).',
    usage: '<start|stop|status|check> [monitor_name|all]',
    /**
     * Executes the monitor command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The configuration object.
     * @param {CronJob} cronUpdate The main cron job (for site-monitor).
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {void}
     */
    execute(message, args, client, state, config, cronUpdate, monitorManager) {
        if (args.length === 0) {
            return message.channel.send(`Usage: \`${config.PREFIX}monitor ${this.usage}\``);
        }

        const subCommand = args.shift().toLowerCase();
        const targetMonitorName = args.shift() || 'all'; // Default to 'all' if no monitor name is provided

        const targetMonitors = targetMonitorName === 'all' 
            ? monitorManager.getAllMonitors() 
            : [monitorManager.getMonitor(targetMonitorName)].filter(Boolean); // Filter out undefined if monitor not found

        if (targetMonitors.length === 0) {
            return message.channel.send(`Monitor "${targetMonitorName}" not found. Available monitors: ${monitorManager.getAllMonitors().map(m => m.name).join(', ')} or 'all'.`);
        }

        switch (subCommand) {
            case 'start': {
                targetMonitors.forEach(monitor => monitor.start());
                message.channel.send(`Started monitor(s): ${targetMonitors.map(m => m.name).join(', ')}.`);
                break;
            }
            case 'stop': {
                targetMonitors.forEach(monitor => monitor.stop());
                message.channel.send(`Stopped monitor(s): ${targetMonitors.map(m => m.name).join(', ')}.`);
                break;
            }
            case 'status': {
                const statuses = targetMonitors.map(monitor => {
                    const status = monitor.getStatus();
                    return `${status.name}: ${status.isRunning ? 'Running 🟢' : 'Stopped 🔴'}`;
                });
                message.channel.send(`Monitor Status:\n${statuses.join('\n')}`);
                break;
            }
            case 'check': {
                message.channel.send(`Triggering check for monitor(s): ${targetMonitors.map(m => m.name).join(', ')}.`);
                targetMonitors.forEach(monitor => monitor.check(client));
                break;
            }
            default:
                message.channel.send(`Invalid subcommand. Usage: \`${config.PREFIX}monitor ${this.usage}\``);
                break;
        }
    },
};