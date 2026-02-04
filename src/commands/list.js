const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('Show list of added sites.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    /**
     * Executes the list command.
     *
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state of the bot.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state) {
        if (state.sitesToMonitor.length < 1) {
            return interaction.reply('No hay sitios siendo monitoreados. Agrega uno con `/add`.');
        }

        const sites = state.sitesToMonitor;
        const siteCount = sites.length;
        const CHUNK_SIZE = 25;

        // Defer if it might take long, but listing is usually fast. 
        await interaction.deferReply();

        const removeButton = new ButtonBuilder()
            .setCustomId('remove:prompt')
            .setLabel('Eliminar un sitio...')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(removeButton);

        /**
         * Formats a date string to a Discord timestamp.
         * @param {string} dateStr The date string.
         * @returns {string} The formatted Discord timestamp.
         */
        const formatDate = (dateStr) => {
            if (!dateStr) return 'Nunca';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return `\`${dateStr}\``;
            const unix = Math.floor(date.getTime() / 1000);
            return `<t:${unix}:R>`;
        };

        for (let i = 0; i < siteCount; i += CHUNK_SIZE) {
            const chunk = sites.slice(i, i + CHUNK_SIZE);
            const embed = new EmbedBuilder()
                .setTitle(`Sitios Monitoreados (${siteCount})`)
                .setDescription(`Mostrando ${i + 1}-${Math.min(i + chunk.length, siteCount)}`)
                .setColor(0x6058f3);

            const fields = chunk.map((site) => ({
                name: (site.id || 'Sitio desconocido').substring(0, 256),
                value: `**URL:** ${site.url}\n**CSS:** \`${site.css}\`\n**Actualizado:** ${formatDate(site.lastUpdated)}`
            }));

            embed.addFields(fields);
            
            const isLastChunk = i + CHUNK_SIZE >= siteCount;
            const options = { embeds: [embed] };
            if (isLastChunk) {
                options.components = [row];
            }

            if (i === 0) {
                await interaction.editReply(options);
            } else {
                await interaction.followUp(options);
            }
        }
    },
};
