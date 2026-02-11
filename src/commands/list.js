const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, RESTJSONErrorCodes } = require('discord.js');
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

        const ITEMS_PER_PAGE = 5;
        const PAGINATION_TIMEOUT = 60000;
        const PREV_BUTTON_ID = 'prev';
        const NEXT_BUTTON_ID = 'next';
        
        const totalPages = Math.ceil(sites.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        // Defer if it might take long, but listing is usually fast. 
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        /**
         * Generates the embed for the specified page.
         * @param {number} page The page index.
         * @returns {EmbedBuilder} The generated embed.
         */
        const generateEmbed = (page) => {
            const start = page * ITEMS_PER_PAGE;
            const end = Math.min(start + ITEMS_PER_PAGE, sites.length);
            const chunk = sites.slice(start, end);

            const embed = new EmbedBuilder()
                .setTitle(`Sitios Monitoreados (${sites.length})`)
                .setDescription(`Mostrando ${start + 1}-${end} de ${sites.length}`)
                .setColor(0x6058f3);

            const fields = chunk.map((site, index) => ({
                name: `${start + index + 1}. ${sanitizeMarkdown(site.id || 'Sitio desconocido')}`.substring(0, 256),
                value: `🔗 **URL:** ${sanitizeMarkdown((site.url || '').substring(0, 300))}\n🔍 **CSS:** \`${sanitizeMarkdown((site.css || '').substring(0, 100))}\`\n🕒 **Actualizado:** ${formatDiscordTimestamp(site.lastUpdated)}`.substring(0, 1024)
            }));

            embed.addFields(fields);
            return embed;
        };

        /**
         * Generates the action row with pagination buttons.
         * @param {number} page The current page index.
         * @returns {ActionRowBuilder} The generated action row.
         */
        const generateButtons = (page) => {
            const row = new ActionRowBuilder();
            
            const prevButton = new ButtonBuilder()
                .setCustomId(PREV_BUTTON_ID)
                .setLabel('Anterior')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0);

            const nextButton = new ButtonBuilder()
                .setCustomId(NEXT_BUTTON_ID)
                .setLabel('Siguiente')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages - 1);

            row.addComponents(prevButton, nextButton);
            return row;
        };

        const response = await interaction.editReply({ 
            embeds: [generateEmbed(currentPage)], 
            components: totalPages > 1 ? [generateButtons(currentPage)] : []
        });

        if (totalPages <= 1) return;

        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: PAGINATION_TIMEOUT 
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                 return i.reply({ content: 'Solo quien ejecutó el comando puede usar los botones.', flags: [MessageFlags.Ephemeral] });
            }

            if (i.customId === PREV_BUTTON_ID) {
                currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === NEXT_BUTTON_ID) {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
            }

            await i.update({ 
                embeds: [generateEmbed(currentPage)], 
                components: [generateButtons(currentPage)] 
            });
        });

        collector.on('end', async () => {
            try {
                const disabledRow = generateButtons(currentPage);
                disabledRow.components.forEach(btn => btn.setDisabled(true));
                await interaction.editReply({ components: [disabledRow] });
            } catch (error) {
                // It's expected that this may fail if the message is deleted or the interaction expires.
                // We can ignore 'Unknown Message' (10008) and 'Unknown Interaction' (10062) errors.
                if (error.code !== RESTJSONErrorCodes.UnknownMessage && error.code !== RESTJSONErrorCodes.UnknownInteraction) {
                    console.error('Failed to disable pagination buttons on collector end:', error);
                }
            }
        });
    },
};
