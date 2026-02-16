const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');
const got = require('got');
const { formatCLP, sanitizeLinkText, formatDiscordTimestamp } = require('../utils/formatters');
const solotodo = require('../utils/solotodo');
const { sleep } = require('../utils/helpers');
const { getSafeGotOptions } = require('../utils/network');
const { downloadImage } = require('../utils/image');

const MIN_SANITY_PRICE = 1000; // Anything below 1,000 CLP is likely an error for Apple products in these categories

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
                
                const response = await got(url.toString(), getSafeGotOptions());
                const body = JSON.parse(response.body);
                if (body.results) {
                    allResults.push(...body.results);
                }
            } catch (e) {
                console.error(`Error fetching from Solotodo URL ${baseUrl}:`, e);
            }

            // Wait configured delay between requests, but not after the last one
            if (i < urls.length - 1) {
                await sleep(this.config.apiDelay);
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
                    
                    // Find the CLP (Currency 1) price in the metadata
                    const prices = entry?.metadata?.prices_per_currency?.find(p => 
                        p.currency === solotodo.SOLOTODO_CLP_CURRENCY_URL
                    );

                    if (!product || !prices) {
                        return null;
                    }

                    // Extract brand - can be at specs.brand_brand_unicode or specs.brand_unicode depending on category
                    const brand = product.specs.brand_brand_unicode || 
                                  product.specs.brand_brand_name || 
                                  product.specs.brand_unicode || 
                                  product.specs.brand_name;

                    return {
                        id: product.id,
                        name: product.name,
                        brand: brand,
                        slug: product.slug,
                        pictureUrl: product.picture_url,
                        offerPrice: parseFloat(prices.offer_price),
                        normalPrice: parseFloat(prices.normal_price)
                    };
                })
                .filter(p => p && p.offerPrice >= MIN_SANITY_PRICE && p.normalPrice >= MIN_SANITY_PRICE);
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
     * @returns {string|null} The notification type if a trigger occurred, or 'CHANGED' if just price changed, or null.
     */
    _checkPriceUpdate(product, now, currentPrice, stored, priceType) {
        const minPriceKey = `min${priceType}Price`;
        const minDateKey = `min${priceType}Date`;
        const lastPriceKey = `last${priceType}Price`;
        const pendingExitKey = `pendingExit${priceType}`;
        const notificationType = priceType.toUpperCase();

        // 1. Check for Pending Exit Confirmation
        if (stored[pendingExitKey]) {
            const pendingExitDate = stored[pendingExitKey].date;
            delete stored[pendingExitKey]; // Delete upfront to avoid repetition

            if (currentPrice > stored[minPriceKey]) {
                // CONFIRMED EXIT
                if (this.config.verboseLogging) {
                    console.log(`[DealMonitor] Confirmed exit from historic low for ${product.name}. Updating minDate to ${pendingExitDate}`);
                }
                stored[minDateKey] = pendingExitDate; // Use the original exit date
                stored[lastPriceKey] = currentPrice;
                return 'CHANGED';
            } else if (currentPrice === stored[minPriceKey]) {
                // PHANTOM SPIKE (Back to Min)
                if (this.config.verboseLogging) {
                    console.log(`[DealMonitor] Phantom spike ignored for ${product.name}. Returning to historic low state.`);
                }
                stored[lastPriceKey] = currentPrice;
                return 'CHANGED';
            }
            // If currentPrice < stored[minPriceKey], we fall through to the new low logic below.
            // The pending exit has been correctly cleared.
        }

        if (currentPrice < stored[minPriceKey]) {
            if (this.config.verboseLogging) {
                console.log(`[DealMonitor] ${product.name} (ID: ${product.id}) [${priceType}] NEW HISTORIC LOW: ${formatCLP(stored[minPriceKey])} -> ${formatCLP(currentPrice)}`);
            }
            stored[minPriceKey] = currentPrice;
            stored[minDateKey] = now;
            stored[lastPriceKey] = currentPrice;
            return `NEW_LOW_${notificationType}`;
        } else if (currentPrice === stored[minPriceKey] && stored[lastPriceKey] > stored[minPriceKey]) {
            if (this.config.verboseLogging) {
                console.log(`[DealMonitor] ${product.name} (ID: ${product.id}) [${priceType}] BACK TO HISTORIC LOW: ${formatCLP(currentPrice)}`);
            }
            stored[lastPriceKey] = currentPrice;
            return `BACK_TO_LOW_${notificationType}`;
        } else if (currentPrice !== stored[lastPriceKey]) {
            const isIncrease = currentPrice > stored[lastPriceKey];
            const wasAtMin = stored[lastPriceKey] === stored[minPriceKey];

            // Log ALL price changes to debug phantom spikes if verbose logging is enabled
            if (this.config.verboseLogging) {
                console.log(`[DealMonitor] Price change for ${product.name} (ID: ${product.id}) [${priceType}] (Min: ${formatCLP(stored[minPriceKey])}): ${formatCLP(stored[lastPriceKey])} -> ${formatCLP(currentPrice)}`);
            }

            // Explicitly log the increase amount for debugging
            if (isIncrease && this.config.verboseLogging) {
                const diff = currentPrice - stored[lastPriceKey];
                console.log(`[DealMonitor] Price INCREASE detected for ${product.name} (ID: ${product.id}) [${priceType}]: +${formatCLP(diff)}`);
            }

            stored[lastPriceKey] = currentPrice;

            if (isIncrease && wasAtMin) {
                /**
                 * "Update on Exit" Logic with Confirmation:
                 * When the price INCREASES from the historic minimum, we don't update minDate immediately.
                 * Instead, we mark it as "Pending Exit".
                 * 
                 * Why?
                 * To avoid "Phantom Spikes" where the price goes up for one cycle and immediately returns.
                 * This prevents false "Back to Historic Low" alerts.
                 */
                if (this.config.verboseLogging) {
                    console.log(`[DealMonitor] Potential exit from historic low for ${product.name} (ID: ${product.id}) [${priceType}]. Waiting for confirmation...`);
                }
                stored[pendingExitKey] = { date: now };
                return 'PENDING';
            }
            
            return 'CHANGED';
        }
        return null;
    }

    /**
     * Internal helper to log price drops that are not historic lows.
     * @private
     * @param {string} productName The name of the product.
     * @param {string} priceType Either 'Offer' or 'Normal'.
     * @param {number} previousPrice The previous price.
     * @param {number} currentPrice The current price.
     * @param {number} minPrice The historic minimum price.
     */
    _logPriceDrop(productName, priceType, previousPrice, currentPrice, minPrice) {
        const typeLabel = priceType === 'Normal' ? ' (Normal)' : '';
        console.log(`[DealMonitor] Price drop for ${productName}${typeLabel}: ${formatCLP(previousPrice)} -> ${formatCLP(currentPrice)} (Historic Low: ${formatCLP(minPrice)})`);
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
                            const history = await solotodo.getProductHistory(productId);
                            for (const entity of history) {
                                // Only backfill history from CLP (Currency 1) entities
                                if (entity.entity?.currency !== solotodo.SOLOTODO_CLP_CURRENCY_URL) {
                                    continue;
                                }

                                for (const record of entity.pricing_history) {
                                    if (!record.is_available) continue;
                                    const offer = parseFloat(record.offer_price);
                                    const normal = parseFloat(record.normal_price);
                                    
                                    // Update on <= to capture the LAST seen date of the minimum price
                                    if (offer >= MIN_SANITY_PRICE && offer <= minOffer) {
                                        minOffer = offer;
                                        minOfferDate = record.timestamp;
                                    }
                                    if (normal >= MIN_SANITY_PRICE && normal <= minNormal) {
                                        minNormal = normal;
                                        minNormalDate = record.timestamp;
                                    }
                                }
                            }
                            if (this.config.verboseLogging) {
                                console.log(`[DealMonitor] Backfill for ${product.name} (ID: ${productId}) complete. Min Offer: ${formatCLP(minOffer)} (${minOfferDate}), Min Normal: ${formatCLP(minNormal)} (${minNormalDate})`);
                            }
                            // Delay to avoid bursting API
                            await sleep(this.config.apiDelay);
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
                
                // Capture previous prices to detect drops that aren't new lows
                const previousOfferPrice = stored.lastOfferPrice;
                const previousNormalPrice = stored.lastNormalPrice;
                
                const offerTrigger = this._checkPriceUpdate(product, now, currentOffer, stored, 'Offer');
                const normalTrigger = this._checkPriceUpdate(product, now, currentNormal, stored, 'Normal');

                // Log significant price drops that don't trigger a notification (Issue #83)
                const priceChecks = [
                    { type: 'Offer', trigger: offerTrigger, current: currentOffer, previous: previousOfferPrice, min: stored.minOfferPrice },
                    { type: 'Normal', trigger: normalTrigger, current: currentNormal, previous: previousNormalPrice, min: stored.minNormalPrice }
                ];

                for (const check of priceChecks) {
                    if (check.trigger === 'CHANGED' && check.current < check.previous) {
                        this._logPriceDrop(product.name, check.type, check.previous, check.current, check.min);
                    }
                }

                let productChanged = !!(offerTrigger || normalTrigger);

                if (offerTrigger || normalTrigger) {
                    const triggers = [offerTrigger, normalTrigger].filter(t => t && t !== 'CHANGED' && t !== 'PENDING');
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
     * Determines the notification metadata based on triggers.
     * @private
     * @param {Array<string>} triggers The list of triggers.
     * @param {object} stored The stored state.
     * @returns {object} Metadata including description and color.
     */
    _getNotificationMetadata(triggers, stored) {
        const bothNewLow = triggers.includes('NEW_LOW_OFFER') && triggers.includes('NEW_LOW_NORMAL');
        const bothBackToLow = triggers.includes('BACK_TO_LOW_OFFER') && triggers.includes('BACK_TO_LOW_NORMAL');
        
        let statusText = '';
        let color = 0x3498db;
        let showDate = false;
        let triggerDate = null;

        if (bothNewLow) {
            statusText = 'Nuevos mínimos históricos';
            color = 0x2ecc71;
        } else if (bothBackToLow) {
            statusText = 'Volvió a precios históricos';
            showDate = true;
            triggerDate = stored?.minOfferDate;
        } else if (triggers.length > 1) {
            statusText = 'Nuevos precios históricos';
            color = 0x2ecc71;
        } else {
            const type = triggers[0];
            const notificationConfig = {
                'NEW_LOW_OFFER': { text: 'Nuevo mínimo histórico con Tarjeta', color: 0x2ecc71 },
                'BACK_TO_LOW_OFFER': { text: 'Volvió al mínimo histórico con Tarjeta', showDate: true, date: stored?.minOfferDate },
                'NEW_LOW_NORMAL': { text: 'Nuevo mínimo histórico con todo medio de pago', color: 0x27ae60 },
                'BACK_TO_LOW_NORMAL': { text: 'Volvió al mínimo histórico con todo medio de pago', showDate: true, date: stored?.minNormalDate }
            };
            const details = notificationConfig[type];
            statusText = details?.text || '';
            color = details?.color || 0x3498db;
            showDate = details?.showDate || false;
            if (details?.date) triggerDate = details.date;
        }

        let description = statusText;
        if (showDate && triggerDate) {
            description += ` de ${formatDiscordTimestamp(triggerDate)}`;
        }

        return { description, color };
    }

    /**
     * Attempts to download a fallback image if the primary picture URL is invalid.
     * @private
     * @param {object} product The product object.
     * @param {Array} entities The list of entities.
     * @returns {Promise<Discord.AttachmentBuilder|null>} The attachment or null.
     */
    async _getFallbackAttachment(product, entities) {
        const allUrls = [
            product.pictureUrl,
            ...entities.map(e => e.picture_urls?.[0])
        ];
        const candidateUrls = [...new Set(allUrls.filter(Boolean))];

        for (const url of candidateUrls) {
            try {
                const { buffer, extension } = await downloadImage(url);
                const fileName = `product_${product.id}.${extension}`;
                return new Discord.AttachmentBuilder(buffer, { name: fileName });
            } catch (error) {
                console.error(`[DealMonitor] Failed to download fallback image for product ${product.id} from ${url}:`, error.message);
            }
        }
        return null;
    }

    /**
     * Sends a notification about a deal.
     * @param {object} change The change details.
     */
    async notify(change) {
        let { product, triggers, stored, type } = change;
        
        // Backward compatibility
        if (!triggers && type) triggers = [type];
        if (!Array.isArray(triggers)) triggers = [];

        const channel = this.getNotificationChannel();
        if (!channel) return;

        // 1. Fetch Data
        const entities = await solotodo.getAvailableEntities(product.id);
        const storeMap = await solotodo.getStores();
        const pictureUrl = await solotodo.getBestPictureUrl(product, entities);
        const bestEntity = solotodo.findBestEntity(entities, triggers);

        // 2. Validate
        if (!bestEntity) return;

        // 3. Prepare Metadata
        const sanitizedName = sanitizeLinkText(product.name);
        const { description, color } = this._getNotificationMetadata(triggers, stored);

        // 4. Build Embed
        const embed = new Discord.EmbedBuilder()
            .setTitle(sanitizedName)
            .setDescription(description)
            .addFields([
                { name: '💳 Precio Tarjeta', value: `${formatCLP(product.offerPrice)}`, inline: true },
                { name: '💰 Precio Normal', value: `${formatCLP(product.normalPrice)}`, inline: true }
            ])
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: 'powered by Solotodo'});

        if (bestEntity.external_url) {
            const storeName = storeMap.get(bestEntity.store) || 'Tienda';
            const safeUrl = encodeURI(bestEntity.external_url).replace(/\)/g, '%29');
            embed.addFields([{ name: `🛒 Vendido por ${storeName}`, value: `[Ir a la tienda ↗](${safeUrl})`, inline: false }]);
        }

        // 5. Handle Image / Attachment
        let attachment = null;
        if (pictureUrl) {
            embed.setThumbnail(pictureUrl);
        } else {
            attachment = await this._getFallbackAttachment(product, entities);
            if (attachment) {
                embed.setThumbnail(`attachment://${attachment.name}`);
            }
        }

        // 6. Send
        if (this.config.verboseLogging) {
            const minOffer = stored?.minOfferPrice != null ? formatCLP(stored.minOfferPrice) : 'N/A';
            const minNormal = stored?.minNormalPrice != null ? formatCLP(stored.minNormalPrice) : 'N/A';
            console.log(`[DealMonitor] Raising Discord alert for ${product.name} (ID: ${product.id}). Triggers: ${triggers.join(', ')}. Current: ${formatCLP(product.offerPrice)}/${formatCLP(product.normalPrice)}. Min: ${minOffer}/${minNormal}`);
        }

        const messageOptions = { embeds: [embed] };
        if (attachment) messageOptions.files = [attachment];

        const message = await channel.send(messageOptions);

        // 7. Create Thread
        if (message && typeof message.startThread === 'function') {
            try {
                let threadName = sanitizedName;
                if (threadName.length > 100) {
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
