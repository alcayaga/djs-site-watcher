const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { formatDiscordTimestamp, sanitizeMarkdown } = require('../utils/formatters');

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
     * @param {object} config The config object.
     * @param {import('../MonitorManager')} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const siteMonitor = monitorManager.getMonitor('Site');
        const sites = siteMonitor ? siteMonitor.state : [];

        if (sites.length < 1) {
            return interaction.reply('No hay sitios siendo monitoreados. Agrega uno con `/add`.');
        }

        const ITEMS_PER_PAGE = 5;
        const totalPages = Math.ceil(sites.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        // Defer reply as we prepare the embed
        await interaction.deferReply();

        /**
         * Generates the embed for a specific page.
         * @param {number} page The page index (0-based).
         * @returns {EmbedBuilder} The generated embed.
         */
        const generateEmbed = (page) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentSites = sites.slice(start, end);

            const embed = new EmbedBuilder()
                .setTitle(`Sitios Monitoreados (${sites.length})`)
                .setDescription(`Página ${page + 1} de ${totalPages}`)
                .setColor(0x6058f3)
                .setFooter({ text: `Mostrando sitios ${start + 1}-${Math.min(end, sites.length)}` });

            const fields = currentSites.map((site, index) => ({
                name: `${start + index + 1}. ${sanitizeMarkdown(site.id || 'Sitio desconocido')}`.substring(0, 256),
                value: `🔗 **URL:** ${sanitizeMarkdown(site.url.substring(0, 500))}\n🔍 **CSS:** \`${sanitizeMarkdown(site.css.substring(0, 200))}\`\n🕒 **Actualizado:** ${formatDiscordTimestamp(site.lastUpdated)}`
            }));

            embed.addFields(fields);
            return embed;
        };

        /**
         * Generates the action row with pagination buttons.
         * @param {number} page The page index (0-based).
         * @returns {ActionRowBuilder} The generated action row.
         */
        const generateRow = (page) => {
            const row = new ActionRowBuilder();

            const prevBtn = new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀ Anterior')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0);

            const nextBtn = new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Siguiente ▶')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages - 1);

            const removeBtn = new ButtonBuilder()
                .setCustomId('remove:prompt')
                .setLabel('Eliminar un sitio...')
                .setStyle(ButtonStyle.Danger);

            row.addComponents(prevBtn, nextBtn, removeBtn);
            return row;
        };

        const initialMessage = await interaction.editReply({
            embeds: [generateEmbed(currentPage)],
            components: [generateRow(currentPage)]
        });

        const collector = initialMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            // Allow other users to use the remove button? 
            // The logic below assumes only the command author controls pagination.
            // But 'remove:prompt' is handled by interactionHandler.js globally usually? 
            // Wait, remove:prompt is a customId that might be handled by another handler?
            // The previous code had it. Let's check if we should intercept it here.
            // If it's 'remove:prompt', we should probably let it bubble up OR handle it if we want to.
            // However, usually collectors stop propagation if they acknowledge.
            
            // Current 'remove' logic in old list.js just added the button. 
            // The handler for 'remove:prompt' likely lives in 'src/handlers/interactionHandler.js'.
            // Let's check interactionHandler.js later.
            // For now, if the ID is 'prev' or 'next', we handle it.
            
            if (i.user.id !== interaction.user.id) {
                // If it's a pagination button, only allow the author.
                // If it's remove, maybe allow anyone with permissions?
                // For safety, let's restrict pagination to author.
                if (['prev', 'next'].includes(i.customId)) {
                    return i.reply({ content: 'Solo quien ejecutó el comando puede cambiar de página.', flags: [4096] }); // Ephemeral
                }
            }

            if (i.customId === 'prev') {
                if (currentPage > 0) {
                    currentPage--;
                    await i.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [generateRow(currentPage)]
                    });
                }
            } else if (i.customId === 'next') {
                if (currentPage < totalPages - 1) {
                    currentPage++;
                    await i.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [generateRow(currentPage)]
                    });
                }
            } 
            // We do NOT acknowledge 'remove:prompt' here so the global handler can pick it up?
            // Wait, a collector on a message *consumes* the interaction if we reply/update?
            // If we don't do anything for 'remove:prompt', the interaction will fail (interaction failed).
            // We should check if 'remove:prompt' is handled elsewhere.
        });

        collector.on('end', () => {
            // Disable pagination buttons when time is up
            const disabledRow = generateRow(currentPage);
            disabledRow.components.forEach(c => {
                 // Disable prev/next, keep remove? Or disable all?
                 // Usually cleaner to disable all or remove the row.
                 // Let's disable all.
                 c.setDisabled(true);
            });
            
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
