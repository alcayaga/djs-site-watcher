const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');
const { formatCLP, sanitizeLinkText, formatDiscordTimestamp } = require('../utils/formatters');
const { getProductUrl, getProductHistory, getBestPictureUrl } = require('../utils/solotodo');
const { sleep } = require('../utils/helpers');

/**
 * Monitor for Solotodo deals on Apple products.
 * Tracks price history and alerts when a product reaches its historic minimum price.
 */
class DealMonitor extends Monitor {
    /**
     * Parses the Solotodo API response.
     * @param {string} data The JSON string from the API.
     * @returns {Array} List of products with relevant price info.
     */
    parse(data) {
        try {
            const body = JSON.parse(data);
            if (!body.results || !Array.isArray(body.results)) return [];

            return body.results
                .map(result => {
                    const entry = result.product_entries?.[0];
                    const product = entry?.product;
                    const prices = entry?.metadata?.prices_per_currency?.[0];

                    if (!product || !prices) {
                        return null;
                    }

                    return {
                        id: product.id,
                        name: product.name,
                        brand: product.specs.brand_brand_unicode || product.specs.brand_brand_name,
                        slug: product.slug,
                        pictureUrl: product.picture_url,
                        offerPrice: parseFloat(prices.offer_price),
                        normalPrice: parseFloat(prices.normal_price)
                    };
                })
                .filter(p => p && p.brand === 'Apple');
        } catch (e) {
            console.error('Error parsing Solotodo data in DealMonitor:', e);
            return [];
        }
    }

    /**
     * Internal helper to check for price updates and trigger notifications.
     * @private
     * @param {object} product The product object.
     * @param {string} now The current timestamp.
     * @param {number} currentPrice The current price value.
     * @param {object} stored The stored state for this product.
     * @param {string} priceType The type of price being checked ('Offer' or 'Normal').
     * @returns {Promise<boolean>} True if the product state has changed.
     */
    async _checkPriceUpdate(product, now, currentPrice, stored, priceType) {
        let changed = false;
        const minPriceKey = `min${priceType}Price`;
        const minDateKey = `min${priceType}Date`;
        const lastPriceKey = `last${priceType}Price`;
        const notificationType = priceType.toUpperCase();

        if (currentPrice < stored[minPriceKey]) {
            stored[minPriceKey] = currentPrice;
            stored[minDateKey] = now;
            stored[lastPriceKey] = currentPrice;
            await this.notify({ product, type: `NEW_LOW_${notificationType}`, date: now });
            changed = true;
        } else if (currentPrice === stored[minPriceKey] && stored[lastPriceKey] > stored[minPriceKey]) {
            stored[lastPriceKey] = currentPrice;
            await this.notify({ product, type: `BACK_TO_LOW_${notificationType}`, date: stored[minDateKey] });
            changed = true;
        } else if (currentPrice !== stored[lastPriceKey]) {
            stored[lastPriceKey] = currentPrice;
            changed = true;
        }
        return changed;
    }

    /**
     * Overrides the base check method to handle list of products and state merging.
     */
    async check() {
        console.log(`Checking for ${this.name} updates...`);
        try {
            const data = await this.fetch();
            const products = this.parse(data);
            
            let hasChanges = false;
            const newState = { ...this.state };
            const isSingleRun = String(config.SINGLE_RUN).toLowerCase() === 'true';

            for (const product of products) {
                // Security: Prevent Prototype Pollution
                const productId = String(product.id);
                if (productId === '__proto__' || productId === 'constructor' || productId === 'prototype') continue;

                let stored = newState[productId];

                if (!stored) {
                    // First time seeing this product
                    let minOffer = product.offerPrice;
                    let minNormal = product.normalPrice;
                    let minOfferDate = new Date().toISOString();
                    let minNormalDate = new Date().toISOString();

                    if (!isSingleRun) {
                        console.log(`New product detected: ${product.name} (ID: ${productId}). Backfilling history...`);
                        try {
                            const history = await getProductHistory(productId);
                            for (const entity of history) {
                                for (const record of entity.pricing_history) {
                                    if (!record.is_available) continue;
                                    const offer = parseFloat(record.offer_price);
                                    const normal = parseFloat(record.normal_price);
                                    
                                    if (offer < minOffer) {
                                        minOffer = offer;
                                        minOfferDate = record.timestamp;
                                    }
                                    if (normal < minNormal) {
                                        minNormal = normal;
                                        minNormalDate = record.timestamp;
                                    }
                                }
                            }
                            // Delay to avoid bursting API
                            await sleep(2000);
                        } catch (historyError) {
                            console.error(`Error backfilling history for product ${productId}:`, historyError);
                        }
                    }

                    newState[productId] = {
                        minOfferPrice: minOffer,
                        minOfferDate,
                        minNormalPrice: minNormal,
                        minNormalDate,
                        lastOfferPrice: product.offerPrice,
                        lastNormalPrice: product.normalPrice,
                        name: product.name,
                        slug: product.slug,
                        pictureUrl: product.pictureUrl
                    };
                    hasChanges = true;
                    continue;
                }

                const currentOffer = product.offerPrice;
                const currentNormal = product.normalPrice;
                const now = new Date().toISOString();
                
                let productChanged = false;

                productChanged = await this._checkPriceUpdate(product, now, currentOffer, stored, 'Offer') || productChanged;
                productChanged = await this._checkPriceUpdate(product, now, currentNormal, stored, 'Normal') || productChanged;

                if (stored.name !== product.name) {
                    stored.name = product.name;
                    productChanged = true;
                }

                if (productChanged) hasChanges = true;
            }

            if (hasChanges) {
                await this.saveState(newState);
                this.state = newState;
            }
        } catch (error) {
            console.error(`Error checking ${this.name}:`, error);
        }
    }

    /**
     * Overrides the base getNotificationChannel to use the Deals channel.
     * @returns {object|Discord.TextChannel} The notification channel.
     */
    getNotificationChannel() {
        if (String(config.SINGLE_RUN).toLowerCase() === 'true') {
            return super.getNotificationChannel();
        }
        return this.client.channels.cache.get(config.DISCORDJS_DEALS_CHANNEL_ID);
    }

    /**
     * Sends a notification about a deal.
     * @param {object} change The change details.
     */
    async notify(change) {
        const { product, type, date } = change;
        const channel = this.getNotificationChannel();
        if (!channel) return;

        const productUrl = getProductUrl(product);
        const sanitizedName = sanitizeLinkText(product.name);
        const pictureUrl = await getBestPictureUrl(product);

        const notificationConfig = {
            'NEW_LOW_OFFER': { title: `📉 ¡Nuevo mínimo histórico (Precio Tarjeta): ${sanitizedName}!`, color: 0x2ecc71 },
            'BACK_TO_LOW_OFFER': { title: `🔄 ¡De nuevo a precio mínimo (Precio Tarjeta): ${sanitizedName}!`, showDate: true },
            'NEW_LOW_NORMAL': { title: `📉 ¡Nuevo mínimo histórico (Cualquier medio): ${sanitizedName}!`, color: 0x27ae60 },
            'BACK_TO_LOW_NORMAL': { title: `🔄 ¡De nuevo a precio mínimo (Cualquier medio): ${sanitizedName}!`, showDate: true }
        };

        const details = notificationConfig[type];
        const title = details?.title || '';
        const color = details?.color || 0x3498db;
        const showDate = details?.showDate || false;

        const embed = new Discord.EmbedBuilder()
            .setTitle(title)
            .setURL(productUrl)
            .addFields([
                { name: '💳 Precio Tarjeta', value: `**${formatCLP(product.offerPrice)}**`, inline: true },
                { name: '💰 Precio Normal', value: `**${formatCLP(product.normalPrice)}**`, inline: true }
            ])
            .setColor(color)
            .setTimestamp();

        if (showDate && date) {
            embed.addFields([{ name: '🕒 Visto por última vez', value: formatDiscordTimestamp(date), inline: false }]);
        }

        if (pictureUrl) {
            embed.setThumbnail(pictureUrl);
        }

        const message = await channel.send({ embeds: [embed] });

        // Create a thread for discussion if supported (e.g., text channels in real runs)
        if (message && typeof message.startThread === 'function') {
            try {
                let threadName = sanitizedName;
                if (threadName.length > 100) {
                    // Truncate at the last word boundary to avoid cutting words, and add an ellipsis.
                    const lastSpaceIndex = threadName.substring(0, 100).lastIndexOf(' ');
                    const truncationPoint = lastSpaceIndex > 0 ? lastSpaceIndex : 97;
                    threadName = `${threadName.substring(0, truncationPoint)}...`;
                }

                await message.startThread({
                    name: threadName.trim() || 'Discusión de la oferta',
                    autoArchiveDuration: Discord.ThreadAutoArchiveDuration.OneWeek,
                });
            } catch (threadError) {
                console.error(`Error creating thread for deal ${product.id}:`, threadError);
            }
        }
    }
}

module.exports = DealMonitor;
