const Discord = require('discord.js');

module.exports = {
    name: 'list',
    description: 'Show list of added sites.',
    /**
     * Executes the list command.
     *
     * @param {Discord.Message} message The message object that triggered the command.
     * @param {string[]} args The arguments passed to the command.
     * @param {Discord.Client} client The Discord client.
     * @param {object} state The state of the bot.
     * @returns {Promise<void>}
     */
    async execute(message, args, client, state) {
        try {
            if (state.sitesToMonitor.length < 1) return message.channel.send('No sites to monitor. Add one with `!add`.');

            const sites = state.sitesToMonitor;
            const siteCount = sites.length;
            const CHUNK_SIZE = 25;

            for (let i = 0; i < siteCount; i += CHUNK_SIZE) {
                const chunk = sites.slice(i, i + CHUNK_SIZE);
                const embed = new Discord.EmbedBuilder()
                    .setTitle(`${siteCount} sitio(s) están siendo monitoreados (Mostrando ${i + 1}-${Math.min(i + chunk.length, siteCount)})`)
                    .setColor(0x6058f3);

                const fields = chunk.map((site, j) => ({
                    name: site.id,
                    value: `URL: ${site.url}\nCSS: \`${site.css}\`\nChecked: ${site.lastChecked}\nUpdated: ${site.lastUpdated}\nRemove: \`!remove ${i + j + 1}\``
                }));

                embed.addFields(fields);
                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
            message.reply('there was an error trying to execute that command!');
        }
    },
};