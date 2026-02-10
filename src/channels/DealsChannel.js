const { ThreadAutoArchiveDuration, EmbedBuilder, RESTJSONErrorCodes } = require('discord.js');
const ChannelHandler = require('../ChannelHandler');
const { extractQuery, searchSolotodo, searchByUrl, getProductUrl, getSearchUrl, getAvailableEntities, getStores } = require('../utils/solotodo');
const { sanitizeLinkText, formatCLP, sanitizeMarkdown } = require('../utils/formatters');

/**
 * Handler for Deals channel moderation.
 */
class DealsChannel extends ChannelHandler {
    /**
     * Handles the message for Deals moderation.
     * @param {import('discord.js').Message} message The message object.
     * @param {object} state The application state.
     * @returns {Promise<boolean>} True if handled.
     */
    // eslint-disable-next-line no-unused-vars
    async process(message, state) {
        const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
        let hasValidLink = false;
        let validatedUrl = null;

        if (urlMatch) {
            try {
                const potentialUrl = new URL(urlMatch[0]);
                // Ensure it has a TLD-like structure (at least one dot)
                // We also check that the dot is not at the start or end of the hostname
                const hostname = potentialUrl.hostname;
                if (hostname.includes('.') && !hostname.startsWith('.') && !hostname.endsWith('.')) {
                    hasValidLink = true;
                    validatedUrl = potentialUrl.href;
                }
            } catch (e) {
                hasValidLink = false;
                console.warn(`Failed to parse URL "${urlMatch[0]}":`, e.message);
            }
        }

        const hasAttachment = message.attachments.size > 0;

        if (hasValidLink || hasAttachment) {
            // It's a deal, create a thread for discussion.
            let thread;
            try {
                thread = await message.startThread({
                    name: message.content.trim().substring(0, 100) || 'Discusión de la oferta',
                    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
                });
            } catch (error) {
                console.error('Error creating thread in DealsChannel handler:', error);
                // If thread creation fails, we return early to trigger deletion and notification.
                return true;
            }

            // Attempt to find product on Solotodo
            try {
                let product = null;
                
                // 1. Try exact URL match first
                if (validatedUrl) {
                    product = await searchByUrl(validatedUrl);
                }

                // 2. If no exact match, try text query
                let query = null;
                if (!product) {
                    query = extractQuery(message.content);
                    if (query) {
                        product = await searchSolotodo(query);
                    }
                }

                if (product) {
                    const sanitizedName = sanitizeLinkText(product.name);
                    const productUrl = getProductUrl(product);
                    
                    const embed = new EmbedBuilder()
                        .setTitle(sanitizedName)
                        .setURL(productUrl)
                        .setDescription(`He encontrado este producto en Solotodo para referencia:\n[${sanitizedName}](${productUrl})`)
                        .setColor(0x6058f3)
                        .setTimestamp();

                    if (product.picture_url) {
                        embed.setThumbnail(product.picture_url);
                    }

                    // Fetch prices from top 3 sellers
                    try {
                        const [entities, storeMap] = await Promise.all([
                            getAvailableEntities(product.id),
                            getStores()
                        ]);

                        const filteredEntities = entities
                            .filter(e => e.active_registry.cell_monthly_payment === null && e.active_registry.is_available)
                            .map(e => ({
                                ...e,
                                offerPriceNum: parseFloat(e.active_registry.offer_price),
                                normalPriceNum: parseFloat(e.active_registry.normal_price)
                            }))
                            .sort((a, b) => a.offerPriceNum - b.offerPriceNum)
                            .slice(0, 3);

                        if (filteredEntities.length > 0) {
                            const priceList = filteredEntities.map(entity => {
                                const storeName = storeMap.get(entity.store) || 'Tienda';
                                let line = `• [${sanitizeLinkText(storeName)}](${entity.external_url}): **${formatCLP(entity.offerPriceNum)}**`;
                                if (Math.floor(entity.normalPriceNum) !== Math.floor(entity.offerPriceNum)) {
                                    line += ` (Normal: ${formatCLP(entity.normalPriceNum)})`;
                                }
                                return line;
                            }).join('\n');
                            embed.addFields({ name: '💰 Mejores precios actuales', value: priceList });
                        }
                    } catch (priceError) {
                        console.error('Error fetching entities or stores in DealsChannel:', priceError);
                    }

                    await thread.send({ embeds: [embed] });
                } else if (query) {
                    // Only show fallback search link if we actually had a search query
                    const searchUrl = getSearchUrl(query);
                    const fallbackEmbed = new EmbedBuilder()
                        .setTitle(`Búsqueda: ${sanitizeMarkdown(query)}`)
                        .setURL(searchUrl)
                        .setDescription(`No encontré una coincidencia exacta, pero puedes buscar referencias aquí: [Resultados en Solotodo](${searchUrl})`)
                        .setColor(0x6058f3);
                    
                    await thread.send({ embeds: [fallbackEmbed] });
                }
            } catch (error) {
                console.error('Error in Solotodo logic:', error);
            }

            return false;
        }

        // Not a deal, delete and notify user.
        try {
            await message.delete();
        } catch (deleteError) {
            console.error('Error deleting message in DealsChannel handler:', deleteError);
            // If deletion fails, notify the channel about missing permissions
            if (deleteError.code === RESTJSONErrorCodes.MissingPermissions) { // Missing Permissions
                try {
                    await message.reply('⚠️ No tengo permisos para moderar este canal. Por favor, asegúrate de que tenga el permiso "Gestionar mensajes".');
                } catch (replyError) {
                    console.error('Could not send permission warning to channel:', replyError);
                }
            }
            return true;
        }

        // Send notification via DM with an Embed for better presentation
        const notificationEmbed = new EmbedBuilder()
            .setTitle('⚠️ Mensaje eliminado')
            .setDescription(`Hola ${message.author.displayName}, tu mensaje en <#${message.channel.id}> fue eliminado porque no parece ser una oferta.`)
            .addFields([
                { 
                    name: '📌 Regla del canal', 
                    value: 'Este canal es **solo para compartir ofertas**. Los mensajes deben contener al menos un enlace o una imagen.' 
                },
                { 
                    name: '💬 ¿Cómo discutir?', 
                    value: 'Por favor, utiliza los hilos automáticos para discutir las ofertas existentes.' 
                }
            ])
            .setColor(0xffcc00) // Yellow/Warning color
            .setTimestamp();

        try {
            await message.author.send({ embeds: [notificationEmbed] });
        } catch (sendError) {
            console.error('Could not send DM to user:', sendError);
        }

        return true;
    }
}

module.exports = DealsChannel;