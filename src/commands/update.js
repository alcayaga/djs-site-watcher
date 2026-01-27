const siteMonitor = require('../site-monitor');

module.exports = {
    name: 'update',
    description: 'Manually update sites.',
    /**
     * Executes the update command.
     * @param {Discord.Message} message The message object.
     * @param {string[]} args The arguments array.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state object.
     * @returns {void}
     */
    execute(message, args, client, state) {
        try {
            message.channel.send(`Updating \`${state.sitesToMonitor.length}\` site(s)...`);
            siteMonitor.checkSites(client, state.sitesToMonitor, message.channel);
            message.channel.send(`Done...`);
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};
