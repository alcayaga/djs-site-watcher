const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { sanitizeMarkdown } = require('../utils/formatters');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add site to monitor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    /**
     * Executes the add command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The config object.
     * @param {object} monitorManager The monitor manager.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const siteMonitor = monitorManager.getMonitor('Site');
        if (!siteMonitor) {
            return interaction.reply({ content: 'El monitor de sitios no está disponible.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId('add:submit')
            .setTitle('Agregar sitio para monitorear');

        const urlInput = new TextInputBuilder()
            .setCustomId('urlInput')
            .setLabel("URL del sitio")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const selectorInput = new TextInputBuilder()
            .setCustomId('selectorInput')
            .setLabel("Selector CSS (por defecto: head)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        const forceInput = new TextInputBuilder()
            .setCustomId('forceInput')
            .setLabel("¿Forzar agregado si falla? (si/no)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('no')
            .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(urlInput);
        const secondActionRow = new ActionRowBuilder().addComponents(selectorInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(forceInput);

        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        await interaction.showModal(modal);
    },

    /**
     * Handles the modal submission for the add command.
     * @param {import('discord.js').ModalSubmitInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The config object.
     * @param {object} monitorManager The monitor manager.
     * @returns {Promise<void>}
     */
    async handleModal(interaction, client, state, config, monitorManager) {
        const urlString = interaction.fields.getTextInputValue('urlInput');
        const selectorRaw = interaction.fields.getTextInputValue('selectorInput');
        const selector = selectorRaw || 'head';
        
        const forceRaw = interaction.fields.getTextInputValue('forceInput');
        const forceString = forceRaw ? forceRaw.toLowerCase().trim() : '';
        const force = ['si', 'yes', 's', 'y'].includes(forceString);

        let url;
        try {
            url = new URL(urlString);
            if (!['http:', 'https:'].includes(url.protocol)) {
                return interaction.reply({ content: 'Protocolo inválido. Solo se permite HTTP y HTTPS.', flags: [MessageFlags.Ephemeral] });
            }
        } catch {
            return interaction.reply({ content: 'Formato de URL inválido.', flags: [MessageFlags.Ephemeral] });
        }

        const siteMonitor = monitorManager.getMonitor('Site');

        // Defer reply since adding a site might take a moment (fetching)
        await interaction.deferReply();

        try {
            const { site, warning } = await siteMonitor.addSite(urlString, selector, force);

            // Update local state to match the monitor's state (which is the source of truth)
            state.sitesToMonitor = siteMonitor.state;
            
            let warningMessage = '';
            if (warning) {
                warningMessage = '\n\n⚠️ **Atención:** No se encontró el selector CSS solicitado. Se usará el contenido de toda la página.'
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Sitio Agregado')
                .setDescription(`Se ha comenzado a monitorear **${sanitizeMarkdown(site.id)}** correctamente.`)
                .addFields([
                    { name: '🔗 URL', value: sanitizeMarkdown(site.url.substring(0, 1024)) },
                    { name: '🔍 Selector CSS', value: `\`${sanitizeMarkdown(site.css.substring(0, 1000))}\`${warningMessage}` },
                    { name: '📝 Contenido Detectado', value: site.lastContent ? `\`\`\`\n${sanitizeMarkdown(site.lastContent.substring(0, 100))}${site.lastContent.length > 100 ? '...' : ''}\n\`\`\`` : '*No se detectó contenido*' }
                ])
                .setColor(0x6058f3);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error adding site:', error);
            await interaction.editReply({ content: `Error adding site: ${error.message}` });
        }
    }
};