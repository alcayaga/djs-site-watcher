const { ThreadAutoArchiveDuration } = require('discord.js');
const ChannelHandler = require('../ChannelHandler');
const { extractQuery, searchSolotodo, searchByUrl, getProductUrl, getSearchUrl, getAvailableEntities, getStores } = require('../utils/solotodo');
const { sanitizeLinkText, formatCLP } = require('../utils/formatters');

/**
 * Handler for Deals channel moderation.
 */
class DealsChannel extends ChannelHandler {
    /**
     * Handles the message for Deals moderation.
     * @param {import('discord.js').Message} message The message object.
     * @returns {Promise<boolean>} True if handled.
     */
    async process(message) {
        const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
        const hasLink = !!urlMatch;
        const hasAttachment = message.attachments.size > 0;

        if (hasLink || hasAttachment) {
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
                if (urlMatch) {
                    product = await searchByUrl(urlMatch[0]);
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
                    await thread.send(`Encontré esto en Solotodo: [${sanitizedName}](${getProductUrl(product)})`);

                    // New: Fetch prices from top 3 sellers
                    try {
                        const [entities, storeMap] = await Promise.all([
                            getAvailableEntities(product.id),
                            getStores()
                        ]);

                        const filteredEntities = entities
                            .filter(e => e.active_registry.cell_monthly_payment === null && e.active_registry.is_available)
                            .sort((a, b) => parseFloat(a.active_registry.offer_price) - parseFloat(b.active_registry.offer_price))
                            .slice(0, 3);

                        if (filteredEntities.length > 0) {
                            let priceMsg = '**Mejores precios actuales:**\n';
                            for (const entity of filteredEntities) {
                                const storeName = storeMap.get(entity.store) || 'Tienda';
                                const normalPriceNum = parseFloat(entity.active_registry.normal_price);
                                const offerPriceNum = parseFloat(entity.active_registry.offer_price);
                                
                                priceMsg += `• [${sanitizeLinkText(storeName)}](${entity.external_url}): **${formatCLP(offerPriceNum)}**`;
                                if (Math.floor(normalPriceNum) !== Math.floor(offerPriceNum)) {
                                    priceMsg += ` (Normal: ${formatCLP(normalPriceNum)})`;
                                }
                                priceMsg += '\n';
                            }
                            await thread.send(priceMsg);
                        }
                    } catch (priceError) {
                        console.error('Error fetching entities or stores in DealsChannel:', priceError);
                    }
                } else if (query) {
                    // Only show fallback search link if we actually had a search query
                    await thread.send(`Busca referencias en Solotodo: ${getSearchUrl(query)}`);
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
            // If deletion fails, we return early as we can't notify for a message that wasn't removed.
            return true;
        }

        // Send notification and let any errors propagate.
        await message.author.send(
            `Hola ${message.author.displayName},\n\n` +
            `Tu mensaje en <#${message.channel.id}> fue eliminado porque no parece ser una oferta. Este canal es solo para compartir ofertas (los mensajes deben contener un enlace o una imagen).\n\n` +
            `Por favor, usa hilos para discutir las ofertas existentes.`
        );

        return true;
    }
}

module.exports = DealsChannel;
