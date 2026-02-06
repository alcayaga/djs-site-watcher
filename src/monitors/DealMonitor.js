const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');
const { formatCLP, sanitizeLinkText } = require('../utils/formatters');
const { getProductUrl } = require('../utils/solotodo');

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
                        currentPrice: parseFloat(prices.offer_price),
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

            for (const product of products) {
                // Security: Prevent Prototype Pollution
                const productId = String(product.id);
                if (productId === '__proto__' || productId === 'constructor' || productId === 'prototype') continue;

                const stored = newState[productId];
                const currentPrice = product.currentPrice;

                if (!stored) {
                    // First time seeing this product
                    newState[productId] = {
                        minPrice: currentPrice,
                        lastPrice: currentPrice,
                        name: product.name,
                        slug: product.slug,
                        pictureUrl: product.pictureUrl
                    };
                    hasChanges = true;
                } else {
                    const oldMin = stored.minPrice;
                    const oldLast = stored.lastPrice;

                    if (currentPrice < oldMin) {
                        // New historic low
                        stored.minPrice = currentPrice;
                        stored.lastPrice = currentPrice;
                        stored.name = product.name;
                        hasChanges = true;
                        this.notify({ product, type: 'NEW_LOW', oldMin });
                    } else if (currentPrice === oldMin && oldLast > oldMin) {
                        // Back to historic low
                        stored.lastPrice = currentPrice;
                        stored.name = product.name;
                        hasChanges = true;
                        this.notify({ product, type: 'BACK_TO_LOW', oldMin });
                    } else if (stored.lastPrice !== currentPrice || stored.name !== product.name) {
                        // Other update (e.g. price change or name update)
                        stored.lastPrice = currentPrice;
                        stored.name = product.name;
                        hasChanges = true;
                    }
                }
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
    notify(change) {
        const { product, type } = change;
        const channel = this.getNotificationChannel();
        if (!channel) return;

        const productUrl = getProductUrl(product);
        const sanitizedName = sanitizeLinkText(product.name);

        const title = type === 'NEW_LOW' 
            ? `📉 ¡Nuevo mínimo histórico: ${sanitizedName}!`
            : `🔄 ¡De nuevo a precio mínimo: ${sanitizedName}!`;

        const embed = new Discord.EmbedBuilder()
            .setTitle(title)
            .setURL(productUrl)
            .addFields([
                { name: '💰 Precio actual', value: `**${formatCLP(product.currentPrice)}**`, inline: true },
                { name: '🏷️ Precio normal', value: formatCLP(product.normalPrice), inline: true }
            ])
            .setColor(type === 'NEW_LOW' ? 0x2ecc71 : 0x3498db)
            .setTimestamp();

        if (product.pictureUrl) {
            embed.setThumbnail(product.pictureUrl);
        }

        channel.send({ embeds: [embed] });
    }
}

module.exports = DealMonitor;
