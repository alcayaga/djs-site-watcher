const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    /**
     * Executes the help command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @returns {Promise<void>}
     */
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle("🤖 Comandos de Site Watcher")
            .setDescription("Gestiona tus monitores de sitios web y servicios de Apple con los siguientes comandos:")
            .setColor(0x6058f3)
            .addFields([
                { name: '🌐 Monitoreo de Sitios', value: '`/add` - Agrega un nuevo sitio mediante un formulario.\n`/remove` - Elimina un sitio de la lista.\n`/list` | `/show` - Muestra todos los sitios monitoreados.' },
                { name: '⚙️ Configuración', value: '`/interval <minutos>` - Ajusta el intervalo de revisión (1-60 min, por defecto: 5).\n`/help` - Muestra este mensaje de ayuda.' },
                { name: '📊 Gestión de Monitores', value: '`/monitor status [nombre]` - Verifica el estado de los monitores.\n`/monitor start [nombre]` - Inicia monitores específicos o todos.\n`/monitor stop [nombre]` - Detiene monitores específicos o todos.\n`/monitor check [nombre]` - Fuerza una revisión manual.' }
            ])
            .setFooter({ text: 'Tip: ¡Usa el autocompletado para los nombres de los monitores!' });

        await interaction.reply({ embeds: [embed] });
    },
};