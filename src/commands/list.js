const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { formatDiscordTimestamp, sanitizeMarkdown } = require('../utils/formatters');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('Show list of added sites.'),
    /**
     * Executes the list command.
     *
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state of the bot.
     * @param {object} config The config object.
     * @param {import('../MonitorManager')} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const siteMonitor = monitorManager.getMonitor('Site');
        const allSites = siteMonitor ? siteMonitor.state : [];
        
        // Filter by guildId (allow null/undefined for backward compatibility or global sites)
        const sites = allSites.filter(site => !site.guildId || site.guildId === interaction.guildId);

        if (sites.length < 1) {
            return interaction.reply({ content: 'No hay sitios siendo monitoreados en este servidor. Agrega uno con `/add`.', flags: [MessageFlags.Ephemeral] });
        }

        const siteCount = sites.length;
        const CHUNK_SIZE = 5; // Reduced for embed length safety

        // Defer if it might take long, but listing is usually fast. 
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        for (let i = 0; i < siteCount; i += CHUNK_SIZE) {
            const chunk = sites.slice(i, i + CHUNK_SIZE);
            const embed = new EmbedBuilder()
                .setTitle(`Sitios Monitoreados (${siteCount})`)
                .setDescription(`Mostrando ${i + 1}-${Math.min(i + chunk.length, siteCount)}`)
                .setColor(0x6058f3);

            const fields = chunk.map((site, index) => ({
                name: `${i + index + 1}. ${sanitizeMarkdown(site.id || 'Sitio desconocido')}`.substring(0, 256),
                value: `🔗 **URL:** ${sanitizeMarkdown(site.url.substring(0, 500))}\n🔍 **CSS:** \`${sanitizeMarkdown(site.css.substring(0, 200))}\`\n🕒 **Actualizado:** ${formatDiscordTimestamp(site.lastUpdated)}`
            }));

            embed.addFields(fields);
            
            const options = { embeds: [embed], flags: [MessageFlags.Ephemeral] };

            if (i === 0) {
                await interaction.editReply(options);
            } else {
                await interaction.followUp(options);
            }
        }
    },
};
