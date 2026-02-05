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
            return interaction.reply({ content: 'Site monitor is not available.', flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder()
            .setCustomId('add:submit')
            .setTitle('Add Site to Monitor');

        const urlInput = new TextInputBuilder()
            .setCustomId('urlInput')
            .setLabel("Site URL")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const selectorInput = new TextInputBuilder()
            .setCustomId('selectorInput')
            .setLabel("CSS Selector (default: head)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(urlInput);
        const secondActionRow = new ActionRowBuilder().addComponents(selectorInput);

        modal.addComponents(firstActionRow, secondActionRow);

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

        let url;
        try {
            url = new URL(urlString);
            if (!['http:', 'https:'].includes(url.protocol)) {
                return interaction.reply({ content: 'Invalid protocol. Only HTTP and HTTPS are allowed.', flags: [MessageFlags.Ephemeral] });
            }
        } catch {
            return interaction.reply({ content: 'Invalid URL format.', flags: [MessageFlags.Ephemeral] });
        }

        const siteMonitor = monitorManager.getMonitor('Site');

        // Defer reply since adding a site might take a moment (fetching)
        await interaction.deferReply();

        try {
            const { site, warning } = await siteMonitor.addSite(urlString, selector);

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