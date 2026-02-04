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
            return interaction.reply('No sites to monitor. Add one with `/add`.');
        }

        const sites = state.sitesToMonitor;
        const siteCount = sites.length;
        const CHUNK_SIZE = 25;

        // Defer if it might take long, but listing is usually fast. 
        // However, sending multiple embeds might take time.
        await interaction.deferReply();

        const removeButton = new ButtonBuilder()
            .setCustomId('remove:prompt')
            .setLabel('Remove a Site...')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(removeButton);

        for (let i = 0; i < siteCount; i += CHUNK_SIZE) {
            const chunk = sites.slice(i, i + CHUNK_SIZE);
            const embed = new EmbedBuilder()
                .setTitle(`${siteCount} sitio(s) están siendo monitoreados (Mostrando ${i + 1}-${Math.min(i + chunk.length, siteCount)})`)
                .setColor(0x6058f3);

            const fields = chunk.map((site) => ({
                name: site.id,
                value: `URL: ${site.url}\nCSS: \`${site.css}\`\nChecked: ${site.lastChecked}\nUpdated: ${site.lastUpdated}`
            }));

            embed.addFields(fields);
            
            if (i === 0) {
                // If it's the first (or only) page, attach the button row
                const options = { embeds: [embed] };
                if (i + CHUNK_SIZE >= siteCount) {
                    options.components = [row];
                }
                await interaction.editReply(options);
            } else {
                const options = { embeds: [embed] };
                // If it's the last page, attach the button row
                if (i + CHUNK_SIZE >= siteCount) {
                    options.components = [row];
                }
                await interaction.followUp(options);
            }
        }
    },
};
