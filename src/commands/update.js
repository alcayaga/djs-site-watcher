module.exports = {
    name: 'update',
    description: 'Manually update sites.',
    /**
     * Executes the update command.
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
        try {
            const siteMonitor = monitorManager.getMonitor('Site');
            if (siteMonitor) {
                message.channel.send(`Updating \`${siteMonitor.state.sites.length}\` site(s)...`);
                siteMonitor.check(client);
                message.channel.send(`Done...`);
            } else {
                message.channel.send('Site monitor not found.');
            }
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};

