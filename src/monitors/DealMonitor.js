const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');
const got = require('got');
const { formatCLP, sanitizeLinkText, formatDiscordTimestamp } = require('../utils/formatters');
const { getProductUrl, getProductHistory, getBestPictureUrl, getAvailableEntities, getStores } = require('../utils/solotodo');
const { sleep } = require('../utils/helpers');

/**
 * Monitor for Solotodo deals on Apple products.
 * Tracks price history and alerts when a product reaches its historic minimum price.
 */
class DealMonitor extends Monitor {
    /**
     * Creates an instance of DealMonitor.
     * @param {string} name The name of the monitor.
     * @param {object} monitorConfig The configuration object.
     */
    constructor(name, monitorConfig) {
        super(name, monitorConfig);
        // Custom interval for DealMonitor: run once per hour (0 0 * * * *)
        // or as specified in config.
        if (!this.config.interval) {
            this.config.interval = '0 0 * * * *';
        }
        this.setInterval(this.config.interval);
    }

    /**
     * Fetches the data from the monitor's URL(s).
     * Supports multiple URLs and appends exclude_refurbished=true.
     * Fetches are performed sequentially with a delay between them.
     * @returns {Promise<string>} The fetched data as a JSON string.
     */
    async fetch() {
        const urls = Array.isArray(this.config.url) ? this.config.url : [this.config.url];
        const allResults = [];

        for (let i = 0; i < urls.length; i++) {
            const baseUrl = urls[i];
            try {
                const url = new URL(baseUrl);
                url.searchParams.set('exclude_refurbished', 'true');
                
                const response = await got(url.toString());
                const body = JSON.parse(response.body);
                if (body.results) {
                    allResults.push(...body.results);
                }
            } catch (e) {
                console.error(`Error fetching from Solotodo URL ${baseUrl}:`, e);
            }

            // Wait 5 seconds between requests, but not after the last one
            if (i < urls.length - 1) {
                await sleep(5000);
            }
        }

        return JSON.stringify({ results: allResults });
    }
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
     * Internal helper to check for price updates and determine notification type.
     * @private
     * @param {object} product The product object.
     * @param {string} now The current timestamp.
     * @param {number} currentPrice The current price.
     * @param {object} stored The stored state for this product.
     * @param {string} priceType Either 'Offer' or 'Normal'.
     * @returns {Promise<string|null>} The notification type if a trigger occurred, or 'CHANGED' if just price changed, or null.
     */
    async _checkPriceUpdate(product, now, currentPrice, stored, priceType) {
        const minPriceKey = `min${priceType}Price`;
        const minDateKey = `min${priceType}Date`;
        const lastPriceKey = `last${priceType}Price`;
        const notificationType = priceType.toUpperCase();

        if (currentPrice < stored[minPriceKey]) {
            stored[minPriceKey] = currentPrice;
            stored[minDateKey] = now;
            stored[lastPriceKey] = currentPrice;
            return `NEW_LOW_${notificationType}`;
        } else if (currentPrice === stored[minPriceKey] && stored[lastPriceKey] > stored[minPriceKey]) {
            stored[lastPriceKey] = currentPrice;
            return `BACK_TO_LOW_${notificationType}`;
        } else if (currentPrice !== stored[lastPriceKey]) {
            stored[lastPriceKey] = currentPrice;
            return 'CHANGED';
        }
        return null;
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
                
                const offerTrigger = await this._checkPriceUpdate(product, now, currentOffer, stored, 'Offer');
                const normalTrigger = await this._checkPriceUpdate(product, now, currentNormal, stored, 'Normal');

                let productChanged = !!(offerTrigger || normalTrigger);

                if (offerTrigger || normalTrigger) {
                    const triggers = [offerTrigger, normalTrigger].filter(t => t && t !== 'CHANGED');
                    if (triggers.length > 0) {
                        await this.notify({ product, triggers, date: now, stored });
                    }
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
        let { product, triggers, date, stored, type } = change;
        const channel = this.getNotificationChannel();
        if (!channel) return;

        // Backward compatibility: If 'type' is provided instead of 'triggers', convert it.
        if (!triggers && type) {
            triggers = [type];
        }

        if (!Array.isArray(triggers)) {
            triggers = [];
        }

        const entities = await getAvailableEntities(product.id);
        const storeMap = await getStores();
        
        const productUrl = getProductUrl(product);
        const sanitizedName = sanitizeLinkText(product.name);
        const pictureUrl = await getBestPictureUrl(product, entities);

        // Determine if both are new lows or back to lows
        const bothNewLow = triggers.includes('NEW_LOW_OFFER') && triggers.includes('NEW_LOW_NORMAL');
        const bothBackToLow = triggers.includes('BACK_TO_LOW_OFFER') && triggers.includes('BACK_TO_LOW_NORMAL');
        
        let title = '';
        let color = 0x3498db;
        let showDate = false;
        let triggerDate = date;

        if (bothNewLow) {
            title = `📉 ¡Nuevos mínimos históricos!: ${sanitizedName}`;
            color = 0x2ecc71;
        } else if (bothBackToLow) {
            title = `🔄 ¡De nuevo a precios mínimos!: ${sanitizedName}`;
            showDate = true;
            triggerDate = stored.minOfferDate; // Use one of them
        } else {
            // Individual triggers
            const type = triggers[0];
            const notificationConfig = {
                'NEW_LOW_OFFER': { title: `📉 ¡Nuevo mínimo histórico (Precio Tarjeta): ${sanitizedName}!`, color: 0x2ecc71 },
                'BACK_TO_LOW_OFFER': { title: `🔄 ¡De nuevo a precio mínimo (Precio Tarjeta): ${sanitizedName}!`, showDate: true, date: stored?.minOfferDate },
                'NEW_LOW_NORMAL': { title: `📉 ¡Nuevo mínimo histórico (Cualquier medio): ${sanitizedName}!`, color: 0x27ae60 },
                'BACK_TO_LOW_NORMAL': { title: `🔄 ¡De nuevo a precio mínimo (Cualquier medio): ${sanitizedName}!`, showDate: true, date: stored?.minNormalDate }
            };
            const details = notificationConfig[type];
            title = details?.title || '';
            color = details?.color || 0x3498db;
            showDate = details?.showDate || false;
            if (details?.date) triggerDate = details.date;
        }

        // Find the best entity for a direct link
        let bestEntity = null;
        if (entities?.length > 0) {
            const priceKey = triggers.some(t => t.includes('OFFER')) ? 'offer_price' : 'normal_price';
            bestEntity = entities.reduce((min, p) => 
                parseFloat(p.active_registry[priceKey]) < parseFloat(min.active_registry[priceKey]) ? p : min
            );
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

        if (bestEntity) {
            const storeName = storeMap.get(bestEntity.store) || 'Tienda';
            embed.addFields([{ name: `🛒 Ver en ${storeName}`, value: `[Ir a la tienda](${bestEntity.external_url})`, inline: false }]);
        }

        if (showDate && triggerDate) {
            embed.addFields([{ name: '🕒 Visto por última vez', value: formatDiscordTimestamp(triggerDate), inline: false }]);
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
