const { SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, MessageFlags, EmbedBuilder } = require('discord.js');
const { sanitizeMarkdown } = require('../utils/formatters');

/**
 * Generates and sends a dropdown menu to select a site for removal.
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').ButtonInteraction} interaction The interaction object.
 * @param {Array} sites The list of monitored sites.
 * @returns {Promise<void>}
 */
async function showRemovalDropdown(interaction, sites) {
    if (sites.length === 0) {
        const content = 'No hay sitios siendo monitoreados actualmente. Agrega uno con `/add`.';
        return interaction.reply({ content, flags: [MessageFlags.Ephemeral] });
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId('remove:select')
        .setPlaceholder('Selecciona un sitio para eliminar...')
        .addOptions(
            sites.slice(0, 25).map((site, index) => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(site.id.substring(0, 100))
                    .setDescription(site.url.substring(0, 100))
                    .setValue(index.toString())
            )
        );

    const row = new ActionRowBuilder().addComponents(select);

    const response = {
        content: 'Selecciona el sitio que deseas dejar de monitorear:',
        components: [row],
        embeds: [],
        flags: [MessageFlags.Ephemeral]
    };

    await interaction.reply(response);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove site from list.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    /**
     * Executes the remove command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The config object.
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const siteMonitor = monitorManager.getMonitor('Site');

        if (!siteMonitor) {
            return interaction.reply({ content: 'El monitor de sitios no está disponible.', flags: [MessageFlags.Ephemeral] });
        }

        return showRemovalDropdown(interaction, siteMonitor.state);
    },

    /**
     * Handles message component interactions for the remove command.
     * @param {import('discord.js').MessageComponentInteraction} interaction 
     * @param {import('discord.js').Client} client 
     * @param {object} state 
     * @param {object} config 
     * @param {import('../MonitorManager')} monitorManager 
     * @param {string} action 
     * @returns {Promise<void>}
     */
    async handleComponent(interaction, client, state, config, monitorManager, action) {
        const siteMonitor = monitorManager.getMonitor('Site');
        
        if (action === 'prompt') {
            return showRemovalDropdown(interaction, siteMonitor.state);
        }

        if (action === 'select' && interaction.componentType === ComponentType.StringSelect) {
            const index = parseInt(interaction.values[0], 10);
            
            if (isNaN(index) || index < 0 || index >= siteMonitor.state.length) {
                return interaction.update({ content: 'Selección inválida o el sitio ya no existe.', components: [] });
            }

            const removedSite = await siteMonitor.removeSiteByIndex(index);

            // Update the ephemeral message to clear components
            await interaction.update({ 
                content: `Eliminando **${sanitizeMarkdown(removedSite.id)}**...`, 
                components: [] 
            });
            
            // Send a public confirmation
            await interaction.followUp({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ Sitio Eliminado')
                    .setDescription(`Se ha eliminado **${sanitizeMarkdown(removedSite.id)}** de la lista de monitoreo correctamente.`)
                    .setColor(0x57F287) // Discord Green
                ],
                allowedMentions: { parse: [] }
            });
        }
    }
};
