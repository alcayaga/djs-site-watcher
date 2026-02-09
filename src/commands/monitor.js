const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monitor')
        .setDescription('Manage individual or all monitors.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a monitor or all monitors.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the monitor')
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop a monitor or all monitors.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the monitor')
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show status of a monitor or all monitors.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the monitor')
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Trigger a check for a monitor or all monitors.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the monitor')
                        .setAutocomplete(true))),
    /**
     * Executes the monitor command.
     * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
     * @param {import('discord.js').Client} client The Discord client.
     * @param {object} state The state object.
     * @param {object} config The configuration object.
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async execute(interaction, client, state, config, monitorManager) {
        const subCommand = interaction.options.getSubcommand();
        const targetMonitorName = interaction.options.getString('name') || 'all';

        const targetMonitors = targetMonitorName === 'all' 
            ? monitorManager.getAllMonitors() 
            : [monitorManager.getMonitor(targetMonitorName)].filter(Boolean);

        if (targetMonitors.length === 0) {
            return interaction.reply({
                content: `No se encontró el monitor "${targetMonitorName}".`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x6058f3);

        switch (subCommand) {
            case 'start': {
                targetMonitors.forEach(monitor => monitor.start());
                embed.setTitle('🚀 Monitores Iniciados')
                     .setDescription(`Se han iniciado correctamente: **${targetMonitors.map(m => m.name).join('**, **')}**`);
                await interaction.reply({ embeds: [embed] });
                break;
            }
            case 'stop': {
                targetMonitors.forEach(monitor => monitor.stop());
                embed.setTitle('🛑 Monitores Detenidos')
                     .setDescription(`Se han detenido correctamente: **${targetMonitors.map(m => m.name).join('**, **')}**`)
                     .setColor(0xff0000);
                await interaction.reply({ embeds: [embed] });
                break;
            }
            case 'status': {
                const statuses = targetMonitors.map(monitor => {
                    const status = monitor.getStatus();
                    return `**${status.name}**: ${status.isRunning ? 'En ejecución 🟢' : 'Detenido 🔴'}`;
                });
                embed.setTitle('📊 Estado de los Monitores')
                     .setDescription(statuses.join('\n'));
                await interaction.reply({ embeds: [embed] });
                break;
            }
            case 'check': {
                embed.setTitle('🔍 Ejecutando Revisión Manual')
                     .setDescription(`Revisando: **${targetMonitors.map(m => m.name).join('**, **')}**...`);
                await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });

                const results = await Promise.allSettled(targetMonitors.map(monitor => monitor.check(client)));
                
                const failures = results.filter(r => r.status === 'rejected');
                if (failures.length > 0) {
                    console.error(`${failures.length} monitor check(s) failed during manual trigger:`, failures);
                    await interaction.followUp({ 
                        embeds: [new EmbedBuilder()
                            .setTitle('⚠️ Fallo en la Revisión')
                            .setDescription(`Falló la revisión de **${failures.length}** monitor(es). Revisa los logs del bot para más detalles.`)
                            .setColor(0xFEE75C) // Discord Yellow
                        ],
                        flags: [MessageFlags.Ephemeral] 
                    });
                } else {
                    await interaction.followUp({ 
                        embeds: [new EmbedBuilder()
                            .setTitle('✅ Revisión Completada')
                            .setDescription(`Se completó la revisión para: **${targetMonitors.map(m => m.name).join('**, **')}**`)
                            .setColor(0x57F287) // Discord Green
                        ],
                        flags: [MessageFlags.Ephemeral] 
                    });
                }
                break;
            }
        }
    },
    /**
     * Handles autocomplete for the monitor command.
     * @param {import('discord.js').AutocompleteInteraction} interaction The interaction object.
     * @param {object} monitorManager The MonitorManager instance.
     * @returns {Promise<void>}
     */
    async autocomplete(interaction, monitorManager) {
        const focusedValue = interaction.options.getFocused();
        const choices = ['all', ...monitorManager.getAllMonitors().map(m => m.name)];
        const filtered = choices.filter(choice => choice.toLowerCase().startsWith(focusedValue.toLowerCase()));
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice }))
        );
    }
};