const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');
const { formatCLP, sanitizeLinkText, formatDiscordTimestamp } = require('../utils/formatters');
const { getProductUrl, getProductHistory, getBestPictureUrl } = require('../utils/solotodo');

/**
 * Helper to sleep for a given amount of time.
 * @param {number} ms Milliseconds to sleep.
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

                // Simplified migration: reset to current if old structure found
                if (stored.minPrice !== undefined) {
                    stored.minOfferPrice = product.offerPrice;
                    stored.minOfferDate = new Date().toISOString();
                    stored.minNormalPrice = product.normalPrice;
                    stored.minNormalDate = new Date().toISOString();
                    stored.lastOfferPrice = product.offerPrice;
                    stored.lastNormalPrice = product.normalPrice;
                    delete stored.minPrice;
                    delete stored.lastPrice;
                }

                const currentOffer = product.offerPrice;
                const currentNormal = product.normalPrice;
                const now = new Date().toISOString();
                
                let productChanged = false;

                // Check Offer Price (Precio Tarjeta)
                if (currentOffer < stored.minOfferPrice) {
                    stored.minOfferPrice = currentOffer;
                    stored.minOfferDate = now;
                    stored.lastOfferPrice = currentOffer;
                    await this.notify({ product, type: 'NEW_LOW_OFFER', date: now });
                    productChanged = true;
                } else if (currentOffer === stored.minOfferPrice && stored.lastOfferPrice > stored.minOfferPrice) {
                    stored.lastOfferPrice = currentOffer;
                    await this.notify({ product, type: 'BACK_TO_LOW_OFFER', date: stored.minOfferDate });
                    productChanged = true;
                } else if (currentOffer !== stored.lastOfferPrice) {
                    stored.lastOfferPrice = currentOffer;
                    productChanged = true;
                }

                // Check Normal Price
                if (currentNormal < stored.minNormalPrice) {
                    stored.minNormalPrice = currentNormal;
                    stored.minNormalDate = now;
                    stored.lastNormalPrice = currentNormal;
                    await this.notify({ product, type: 'NEW_LOW_NORMAL', date: now });
                    productChanged = true;
                } else if (currentNormal === stored.minNormalPrice && stored.lastNormalPrice > stored.minNormalPrice) {
                    stored.lastNormalPrice = currentNormal;
                    await this.notify({ product, type: 'BACK_TO_LOW_NORMAL', date: stored.minNormalDate });
                    productChanged = true;
                } else if (currentNormal !== stored.lastNormalPrice) {
                    stored.lastNormalPrice = currentNormal;
                    productChanged = true;
                }

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

        let title = '';
        let color = 0x3498db;
        let showDate = false;

        switch (type) {
            case 'NEW_LOW_OFFER':
                title = `📉 ¡Nuevo mínimo histórico (Precio Tarjeta): ${sanitizedName}!`;
                color = 0x2ecc71;
                break;
            case 'BACK_TO_LOW_OFFER':
                title = `🔄 ¡De nuevo a precio mínimo (Precio Tarjeta): ${sanitizedName}!`;
                showDate = true;
                break;
            case 'NEW_LOW_NORMAL':
                title = `📉 ¡Nuevo mínimo histórico (Cualquier medio): ${sanitizedName}!`;
                color = 0x27ae60;
                break;
            case 'BACK_TO_LOW_NORMAL':
                title = `🔄 ¡De nuevo a precio mínimo (Cualquier medio): ${sanitizedName}!`;
                showDate = true;
                break;
        }

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

        channel.send({ embeds: [embed] });
    }
}

module.exports = DealMonitor;
