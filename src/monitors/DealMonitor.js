const Discord = require('discord.js');
const Monitor = require('../Monitor');
const config = require('../config');
const got = require('got');
const { formatCLP, sanitizeLinkText, formatDiscordTimestamp, formatPriceValue, toSafeMarkdownUrl } = require('../utils/formatters');
const solotodo = require('../utils/solotodo');
const { DEFAULT_PRICE_TOLERANCE, DEFAULT_GRACE_PERIOD_HOURS, DEFAULT_MIN_DROP_PERCENTAGE } = require('../utils/constants');
const { sleep } = require('../utils/helpers');
const { getSafeGotOptions } = require('../utils/network');
const { downloadImage } = require('../utils/image');
const logger = require('../utils/logger');

const MIN_SANITY_PRICE = 1000; // Anything below 1,000 CLP is likely an error for Apple products in these categories
const NO_HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours negative-cache TTL for products with no valid history

/**
 * Predicate to check if a price entry corresponds to Chilean Pesos (CLP).
 * We specifically filter for CLP because this bot is designed to alert users in Chile
 * about local deals. Including foreign currencies (like USD or EUR) would result
 * in false positives or invalid price comparisons.
 *
 * @param {object} p The currency price entry from the API.
 * @returns {boolean} True if the currency is CLP.
 */
function isChileanPeso(p) {
    return p.currency === solotodo.SOLOTODO_CLP_CURRENCY_URL || String(p.currency) === solotodo.SOLOTODO_CLP_CURRENCY_ID;
}

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
     * Fetches the data from the monitor's URL(s) and parses it immediately.
     * Supports multiple URLs and appends exclude_refurbished=true.
     * Extracts minimal product objects and discards raw JSON to optimize memory.
     * @returns {Promise<Array>} List of minimal products.
     */
    async fetch() {
        const urls = Array.isArray(this.config.url) ? this.config.url : [this.config.url];
        const products = [];

        for (let i = 0; i < urls.length; i++) {
            const baseUrl = urls[i];
            try {
                const url = new URL(baseUrl);
                url.searchParams.set('exclude_refurbished', 'true');
                
                const response = await got(url.toString(), getSafeGotOptions());
                const body = JSON.parse(response.body);
                
                if (body && body.results && Array.isArray(body.results)) {
                    for (const result of body.results) {
                        const entry = result.product_entries?.[0];
                        const product = entry?.product;
                        
                        const prices = entry?.metadata?.prices_per_currency?.find(isChileanPeso);

                        if (!product || !prices) continue;

                        // Extract brand - can be at specs.brand_brand_unicode or specs.brand_unicode depending on category
                        const brand = product.specs?.brand_brand_unicode || 
                                      product.specs?.brand_brand_name || 
                                      product.specs?.brand_unicode || 
                                      product.specs?.brand_name;

                        const offerPrice = parseFloat(prices.offer_price);
                        const normalPrice = parseFloat(prices.normal_price);

                        if (offerPrice >= MIN_SANITY_PRICE && normalPrice >= MIN_SANITY_PRICE) {
                            products.push({
                                id: product.id,
                                name: product.name,
                                brand: brand,
                                slug: product.slug,
                                pictureUrl: product.picture_url,
                                offerPrice,
                                normalPrice
                            });
                        }
                    }
                }
            } catch (e) {
                logger.error('Error fetching from Solotodo URL %s:', baseUrl, e);
            }

            // Wait configured delay between requests, but not after the last one
            if (i < urls.length - 1) {
                await sleep(this.config.apiDelay);
            }
        }

        return products;
    }

    /**
     * Parses the Solotodo API response.
     * @param {Array} data The extracted product array from fetch().
     * @returns {Array} List of products with relevant price info.
     */
    parse(data) {
        // Data is already parsed and mapped in fetch() to optimize memory
        return Array.isArray(data) ? data : [];
    }

    /**
     * Gets the configured price tolerance in CLP, falling back to DEFAULT_PRICE_TOLERANCE.
     * @private
     * @returns {number} The price tolerance.
     */
    _getTolerance() {
        const parsedTolerance = parseInt(this.config.priceTolerance, 10);
        return !Number.isNaN(parsedTolerance) ? parsedTolerance : DEFAULT_PRICE_TOLERANCE;
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
        const notifiedMinKey = `notifiedMin${priceType}Price`;
        const pendingExitKey = `pendingExit${priceType}`;
        const notificationType = priceType.toUpperCase();
        
        let stateMigrated = false;
        // Ensure notifiedMinKey exists for backward compatibility
        if (stored[notifiedMinKey] === undefined) {
            stored[notifiedMinKey] = stored[minPriceKey];
            stateMigrated = true;
        }
        
        const tolerance = this._getTolerance();
        
        const parsedMinDropPct = parseFloat(this.config.minDropPercentage);
        const minDropPercentage = !Number.isNaN(parsedMinDropPct) ? parsedMinDropPct : DEFAULT_MIN_DROP_PERCENTAGE;
        
        const parsedGrace = parseInt(this.config.gracePeriodHours, 10);
        const gracePeriodHours = !Number.isNaN(parsedGrace) ? parsedGrace : DEFAULT_GRACE_PERIOD_HOURS;

        const isAtMin = currentPrice <= (stored[minPriceKey] + tolerance);
        const wasAtMin = stored[lastPriceKey] <= (stored[minPriceKey] + tolerance);

        // 1. Check for Pending Exit Confirmation
        if (stored[pendingExitKey]) {
            const pendingExitDate = stored[pendingExitKey].date;

            if (currentPrice >= stored[minPriceKey]) {
                if (isAtMin) {
                    // PHANTOM SPIKE / SHORT TOGGLE (Returned to within tolerance of Min)
                    delete stored[pendingExitKey];
                    if (this.config.verboseLogging) {
                        logger.info('[DealMonitor] Price returned to low for %s during grace period. Cancelling exit.', product.name);
                    }
                    stored[lastPriceKey] = currentPrice;
                    return 'CHANGED';
                } else {
                    // Price is still high. Check if grace period has passed.
                    const exitTime = new Date(pendingExitDate).getTime();
                    const nowTime = new Date(now).getTime();
                    const hoursPassed = (nowTime - exitTime) / (1000 * 60 * 60);

                    if (hoursPassed >= gracePeriodHours) {
                        // GRACE PERIOD EXPIRED -> CONFIRM EXIT
                        delete stored[pendingExitKey];
                        if (this.config.verboseLogging) {
                            logger.info('[DealMonitor] Grace period expired for %s. Confirming exit from historic low.', product.name);
                        }
                        stored[minDateKey] = pendingExitDate; // Use the original exit date
                        stored[lastPriceKey] = currentPrice;
                        return 'CHANGED';
                    } else {
                        // STILL IN GRACE PERIOD
                        if (this.config.verboseLogging) {
                            logger.info('[DealMonitor] Still in grace period for %s (%dh/%dh). Waiting...', product.name, Math.floor(hoursPassed), gracePeriodHours);
                        }
                        stored[lastPriceKey] = currentPrice;
                        return 'PENDING';
                    }
                }
            }
            // If currentPrice < stored[minPriceKey], clear pending exit and process as NEW_LOW below
            delete stored[pendingExitKey];
        }

        if (currentPrice < stored[minPriceKey]) {
            const oldMinPrice = stored[minPriceKey];
            const dropAmount = stored[notifiedMinKey] - currentPrice;
            const dropPercentage = (dropAmount / stored[notifiedMinKey]) * 100;
            const isSignificant = dropAmount >= tolerance && dropPercentage >= minDropPercentage;
            
            if (this.config.verboseLogging) {
                logger.info('[DealMonitor] %s (ID: %s) [%s] NEW HISTORIC LOW: %s -> %s (Significant: %s, Drop: %s%% from %s)', product.name, product.id, priceType, formatCLP(oldMinPrice), formatCLP(currentPrice), isSignificant, dropPercentage.toFixed(2), formatCLP(stored[notifiedMinKey]));
            }
            
            stored[minPriceKey] = currentPrice;
            stored[minDateKey] = now;
            stored[lastPriceKey] = currentPrice;
            
            if (isSignificant) {
                stored[notifiedMinKey] = currentPrice;
                return `NEW_LOW_${notificationType}`;
            }
            return 'CHANGED';
        } else if (isAtMin && !wasAtMin) {
            // Check if the drop back to the minimum is significant enough to warrant an alert
            const dropAmount = stored[lastPriceKey] - currentPrice;
            const dropPercentage = (dropAmount / stored[lastPriceKey]) * 100;
            const isSignificant = dropAmount >= tolerance && dropPercentage >= minDropPercentage;

            // Only alert BACK_TO_LOW if:
            // 1. The minimum we are returning to is a minimum we actually notified the user about.
            // 2. The drop from the last known higher price is significant (>= minDropPercentage).
            if (stored[minPriceKey] === stored[notifiedMinKey] && isSignificant) {
                if (this.config.verboseLogging) {
                    logger.info('[DealMonitor] %s (ID: %s) [%s] BACK TO HISTORIC LOW: %s (Drop: %s%%)', product.name, product.id, priceType, formatCLP(currentPrice), dropPercentage.toFixed(2));
                }
                stored[lastPriceKey] = currentPrice;
                return `BACK_TO_LOW_${notificationType}`;
            } else {
                stored[lastPriceKey] = currentPrice;
                return 'CHANGED';
            }
        } else if (currentPrice !== stored[lastPriceKey]) {
            const isIncrease = currentPrice > stored[lastPriceKey];

            // Log ALL price changes to debug phantom spikes if verbose logging is enabled
            if (this.config.verboseLogging) {
                logger.info('[DealMonitor] Price change for %s (ID: %s) [%s] (Min: %s): %s -> %s', product.name, product.id, priceType, formatCLP(stored[minPriceKey]), formatCLP(stored[lastPriceKey]), formatCLP(currentPrice));
            }

            // Explicitly log the increase amount for debugging
            if (isIncrease && this.config.verboseLogging) {
                const diff = currentPrice - stored[lastPriceKey];
                logger.info('[DealMonitor] Price INCREASE detected for %s (ID: %s) [%s]: +%s', product.name, product.id, priceType, formatCLP(diff));
            }

            stored[lastPriceKey] = currentPrice;

            if (isIncrease && wasAtMin && !isAtMin) {
                /**
                 * "Update on Exit" Logic with Confirmation:
                 * When the price INCREASES significantly from the historic minimum, we don't update minDate immediately.
                 * Instead, we mark it as "Pending Exit".
                 * 
                 * Why?
                 * To avoid "Phantom Spikes" or short-term toggles where the price goes up for a few hours and immediately returns.
                 * This prevents false "Back to Historic Low" alerts.
                 */
                if (this.config.verboseLogging) {
                    logger.info('[DealMonitor] Potential exit from historic low for %s (ID: %s) [%s]. Waiting for grace period...', product.name, product.id, priceType);
                }
                stored[pendingExitKey] = { date: now };
                return 'PENDING';
            }
            
            return 'CHANGED';
        }
        
        if (stateMigrated) {
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
        logger.info('[DealMonitor] Price drop for %s%s: %s -> %s (Historic Low: %s)', productName, typeLabel, formatCLP(previousPrice), formatCLP(currentPrice), formatCLP(minPrice));
    }

    /**
     * Overrides the base check method to handle list of products and state merging.
     */
    async check() {
        logger.info('Checking for %s updates...', this.name);
        try {
            const data = await this.fetch();
            const products = this.parse(data);
            let storeMap = null;
            try {
                storeMap = await solotodo.getStores();
            } catch (storeError) {
                logger.error('Error fetching stores for %s:', this.name, storeError);
            }
            
            let hasChanges = false;
            const newState = { ...this.state };
            const isSingleRun = String(config.SINGLE_RUN).toLowerCase() === 'true';

            for (const product of products) {
                // Security: Prevent Prototype Pollution
                const productId = String(product.id);
                if (productId === '__proto__' || productId === 'constructor' || productId === 'prototype') continue;

                const now = new Date().toISOString();

                // Create a shallow copy to ensure immutable updates
                let stored = newState[productId] ? { ...newState[productId] } : null;

                const isUninitialized = !stored || stored.uninitialized;

                if (isUninitialized) {
                    // First time seeing this product or retrying after negative cache expiry
                    let minOffer = Infinity;
                    let minNormal = Infinity;
                    let minOfferDate = now;
                    let minNormalDate = now;

                    if (!isSingleRun) {
                        if (!storeMap) {
                            logger.warn('[DealMonitor] Skipping initialization for %s (ID: %s): storeMap unavailable.', product.name, productId);
                            continue;
                        }

                        // Check finite negative-cache expiry before calling getProductHistory
                        const nowTime = new Date(now).getTime();
                        if (stored?.uninitialized && stored.noHistoryUntil) {
                            const expiryTime = new Date(stored.noHistoryUntil).getTime();
                            if (nowTime < expiryTime) {
                                if (this.config.verboseLogging) {
                                    logger.info('[DealMonitor] Skipping history lookup for %s (ID: %s): negative cache active until %s.', product.name, productId, stored.noHistoryUntil);
                                }
                                continue;
                            }
                        }

                        logger.info('New product detected: %s (ID: %s). Backfilling history...', product.name, productId);
                        try {
                            const history = await solotodo.getProductHistory(productId);
                            let foundOffer = false;
                            let foundNormal = false;
                            for (const entity of history) {
                                // Only backfill history from CLP (Currency 1) entities
                                const entityCurrency = entity.entity?.currency;
                                if (entityCurrency !== solotodo.SOLOTODO_CLP_CURRENCY_URL && String(entityCurrency) !== solotodo.SOLOTODO_CLP_CURRENCY_ID) {
                                    continue;
                                }

                                // Skip non-new, refurbished, or banned stores
                                if (!solotodo.isValidEntity(entity.entity, storeMap)) {
                                    continue;
                                }

                                for (const record of entity.pricing_history) {
                                    if (!record.is_available) continue;
                                    const offer = parseFloat(record.offer_price);
                                    const normal = parseFloat(record.normal_price);
                                    
                                    // Update on <= to capture the LAST seen date of the minimum price
                                    if (offer >= MIN_SANITY_PRICE && (!foundOffer || offer <= minOffer)) {
                                        minOffer = offer;
                                        minOfferDate = record.timestamp;
                                        foundOffer = true;
                                    }
                                    if (normal >= MIN_SANITY_PRICE && (!foundNormal || normal <= minNormal)) {
                                        minNormal = normal;
                                        minNormalDate = record.timestamp;
                                        foundNormal = true;
                                    }
                                }
                            }

                            if (!foundOffer && !foundNormal) {
                                logger.warn('[DealMonitor] Skipping initialization for %s (ID: %s): no valid history records found. Caching negative result.', product.name, productId);
                                const retryAfter = new Date(nowTime + NO_HISTORY_CACHE_TTL_MS).toISOString();
                                newState[productId] = {
                                    uninitialized: true,
                                    noHistoryUntil: retryAfter,
                                    name: product.name
                                };
                                hasChanges = true;
                                await sleep(this.config.apiDelay);
                                continue;
                            }

                            if (!foundOffer) {
                                minOffer = minNormal;
                                minOfferDate = minNormalDate;
                            }
                            if (!foundNormal) {
                                minNormal = minOffer;
                                minNormalDate = minOfferDate;
                            }

                            if (this.config.verboseLogging) {
                                logger.info('[DealMonitor] Backfill for %s (ID: %s) complete. Min Offer: %s (%s), Min Normal: %s (%s)', product.name, productId, formatCLP(minOffer), minOfferDate, formatCLP(minNormal), minNormalDate);
                            }
                            // Delay to avoid bursting API
                            await sleep(this.config.apiDelay);
                        } catch (historyError) {
                            logger.error('Error backfilling history for product %s:', productId, historyError);
                            await sleep(this.config.apiDelay);
                            continue;
                        }
                    } else {
                        minOffer = product.offerPrice;
                        minNormal = product.normalPrice;
                    }

                    newState[productId] = {
                        minOfferPrice: minOffer,
                        minOfferDate,
                        notifiedMinOfferPrice: minOffer,
                        minNormalPrice: minNormal,
                        minNormalDate,
                        notifiedMinNormalPrice: minNormal,
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
                
                // Capture previous prices to detect drops that aren't new lows
                const previousOfferPrice = stored.lastOfferPrice;
                const previousNormalPrice = stored.lastNormalPrice;

                // Snapshot state before check in case candidate deals need to be reverted
                const prevMinOffer = stored.minOfferPrice;
                const prevMinOfferDate = stored.minOfferDate;
                const prevNotifiedMinOffer = stored.notifiedMinOfferPrice;
                const prevPendingExitOffer = stored.pendingExitOffer;

                const prevMinNormal = stored.minNormalPrice;
                const prevMinNormalDate = stored.minNormalDate;
                const prevNotifiedMinNormal = stored.notifiedMinNormalPrice;
                const prevPendingExitNormal = stored.pendingExitNormal;
                const prevSuppressedOffer = stored.suppressedOfferPrice;
                const prevSuppressedOfferTime = stored.suppressedOfferTime;
                const prevSuppressedNormal = stored.suppressedNormalPrice;
                const prevSuppressedNormalTime = stored.suppressedNormalTime;

                let offerTrigger = null;
                let normalTrigger = null;

                /**
                 * Restores offer price state to pre-check snapshot.
                 * @param {number} [targetPrice=previousOfferPrice] Price to set as lastOfferPrice.
                 */
                const restoreOffer = (targetPrice = previousOfferPrice) => {
                    stored.minOfferPrice = prevMinOffer;
                    stored.minOfferDate = prevMinOfferDate;
                    stored.notifiedMinOfferPrice = prevNotifiedMinOffer;
                    if (prevPendingExitOffer !== undefined) {
                        stored.pendingExitOffer = prevPendingExitOffer;
                    } else {
                        delete stored.pendingExitOffer;
                    }
                    stored.lastOfferPrice = targetPrice;
                    offerTrigger = null;
                };

                /**
                 * Restores normal price state to pre-check snapshot.
                 * @param {number} [targetPrice=previousNormalPrice] Price to set as lastNormalPrice.
                 */
                const restoreNormal = (targetPrice = previousNormalPrice) => {
                    stored.minNormalPrice = prevMinNormal;
                    stored.minNormalDate = prevMinNormalDate;
                    stored.notifiedMinNormalPrice = prevNotifiedMinNormal;
                    if (prevPendingExitNormal !== undefined) {
                        stored.pendingExitNormal = prevPendingExitNormal;
                    } else {
                        delete stored.pendingExitNormal;
                    }
                    stored.lastNormalPrice = targetPrice;
                    normalTrigger = null;
                };

                offerTrigger = this._checkPriceUpdate(product, now, currentOffer, stored, 'Offer');
                normalTrigger = this._checkPriceUpdate(product, now, currentNormal, stored, 'Normal');

                // Expire cached suppression after TTL (6 hours) or when browse price changes
                const SUPPRESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
                const nowTime = new Date(now).getTime();

                if (stored.suppressedOfferPrice !== undefined) {
                    const isExpired = stored.suppressedOfferTime &&
                        (nowTime - new Date(stored.suppressedOfferTime).getTime() >= SUPPRESSION_CACHE_TTL_MS);
                    if (stored.suppressedOfferPrice !== currentOffer || isExpired) {
                        delete stored.suppressedOfferPrice;
                        delete stored.suppressedOfferValidMin;
                        delete stored.suppressedOfferTime;
                    }
                }

                if (stored.suppressedNormalPrice !== undefined) {
                    const isExpired = stored.suppressedNormalTime &&
                        (nowTime - new Date(stored.suppressedNormalTime).getTime() >= SUPPRESSION_CACHE_TTL_MS);
                    if (stored.suppressedNormalPrice !== currentNormal || isExpired) {
                        delete stored.suppressedNormalPrice;
                        delete stored.suppressedNormalValidMin;
                        delete stored.suppressedNormalTime;
                    }
                }

                // Determine if offer or normal prices require verification against available merchants
                // Verification is required if a candidate deal trigger fired, or if a lowered historic minimum was recorded
                let needsOfferVerification = Boolean((offerTrigger && offerTrigger !== 'CHANGED' && offerTrigger !== 'PENDING') || (stored.minOfferPrice < prevMinOffer));
                let needsNormalVerification = Boolean((normalTrigger && normalTrigger !== 'CHANGED' && normalTrigger !== 'PENDING') || (stored.minNormalPrice < prevMinNormal));

                // If a previous check already verified that currentOffer/Normal is an unsupported refurbished price,
                // and the cached suppression is still valid, suppress immediately to avoid repeated API calls.
                if (needsOfferVerification && stored.suppressedOfferPrice === currentOffer) {
                    restoreOffer(previousOfferPrice);
                    needsOfferVerification = false;
                }
                if (needsNormalVerification && stored.suppressedNormalPrice === currentNormal) {
                    restoreNormal(previousNormalPrice);
                    needsNormalVerification = false;
                }

                // Verify deal triggers against valid non-refurbished stock
                let verifiedEntities = null;

                if (needsOfferVerification || needsNormalVerification) {
                    if (!storeMap) {
                        logger.warn('[DealMonitor] Store information unavailable. Reverting candidate deals for %s (ID: %s) to prevent unverified alerts.', product.name, productId);
                        if (needsOfferVerification) restoreOffer(previousOfferPrice);
                        if (needsNormalVerification) restoreNormal(previousNormalPrice);
                    } else {
                        try {
                            const rawEntities = await solotodo.getAvailableEntities(product.id);
                            const validEntities = solotodo.filterValidEntities(rawEntities, storeMap);

                            let minValidOffer = Infinity;
                            let minValidNormal = Infinity;
                            for (const entity of validEntities) {
                                const off = parseFloat(entity.active_registry?.offer_price);
                                const norm = parseFloat(entity.active_registry?.normal_price);
                                if (!isNaN(off) && off >= MIN_SANITY_PRICE && off < minValidOffer) {
                                    minValidOffer = off;
                                }
                                if (!isNaN(norm) && norm >= MIN_SANITY_PRICE && norm < minValidNormal) {
                                    minValidNormal = norm;
                                }
                            }

                            const tolerance = this._getTolerance();

                            // Check offer deal validity
                            if (needsOfferVerification) {
                                const isOfferSupported = minValidOffer <= (currentOffer + tolerance);
                                if (!isOfferSupported) {
                                    if (this.config.verboseLogging) {
                                        logger.warn('[DealMonitor] Suppressing %s for %s (ID: %s) at %s: Not supported by any valid merchant (best valid: %s). Reverting min.',
                                            offerTrigger || 'min drop', product.name, productId, formatCLP(currentOffer), formatCLP(minValidOffer));
                                    }
                                    restoreOffer(previousOfferPrice);
                                    if (minValidOffer < Infinity) {
                                        offerTrigger = this._checkPriceUpdate(product, now, minValidOffer, stored, 'Offer');
                                    }
                                    stored.suppressedOfferPrice = currentOffer;
                                    stored.suppressedOfferValidMin = minValidOffer < Infinity ? minValidOffer : null;
                                    stored.suppressedOfferTime = now;
                                } else {
                                    delete stored.suppressedOfferPrice;
                                    delete stored.suppressedOfferValidMin;
                                    delete stored.suppressedOfferTime;
                                }
                            }

                            // Check normal deal validity
                            if (needsNormalVerification) {
                                const isNormalSupported = minValidNormal <= (currentNormal + tolerance);
                                if (!isNormalSupported) {
                                    if (this.config.verboseLogging) {
                                        logger.warn('[DealMonitor] Suppressing %s for %s (ID: %s) at %s: Not supported by any valid merchant (best valid: %s). Reverting min.',
                                            normalTrigger || 'min drop', product.name, productId, formatCLP(currentNormal), formatCLP(minValidNormal));
                                    }
                                    restoreNormal(previousNormalPrice);
                                    if (minValidNormal < Infinity) {
                                        normalTrigger = this._checkPriceUpdate(product, now, minValidNormal, stored, 'Normal');
                                    }
                                    stored.suppressedNormalPrice = currentNormal;
                                    stored.suppressedNormalValidMin = minValidNormal < Infinity ? minValidNormal : null;
                                    stored.suppressedNormalTime = now;
                                } else {
                                    delete stored.suppressedNormalPrice;
                                    delete stored.suppressedNormalValidMin;
                                    delete stored.suppressedNormalTime;
                                }
                            }

                            verifiedEntities = validEntities;
                        } catch (entityError) {
                            logger.error('Error verifying entities for product %s:', productId, entityError);
                            // Fail safe: Revert mutations made by _checkPriceUpdate so unverified deals are not saved or notified
                            if (needsOfferVerification) restoreOffer(previousOfferPrice);
                            if (needsNormalVerification) restoreNormal(previousNormalPrice);
                        }
                    }
                }

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

                const priceChanged = stored.lastOfferPrice !== previousOfferPrice || stored.lastNormalPrice !== previousNormalPrice;
                const suppressionChanged = stored.suppressedOfferPrice !== prevSuppressedOffer ||
                    stored.suppressedOfferTime !== prevSuppressedOfferTime ||
                    stored.suppressedNormalPrice !== prevSuppressedNormal ||
                    stored.suppressedNormalTime !== prevSuppressedNormalTime;
                let productChanged = !!(offerTrigger || normalTrigger) || priceChanged || suppressionChanged;

                if (offerTrigger || normalTrigger) {
                    const triggers = [offerTrigger, normalTrigger].filter(t => t && t !== 'CHANGED' && t !== 'PENDING');
                    if (triggers.length > 0) {
                        const effectiveProduct = {
                            ...product,
                            offerPrice: stored.lastOfferPrice ?? product.offerPrice,
                            normalPrice: stored.lastNormalPrice ?? product.normalPrice
                        };
                        await this.notify({
                            product: effectiveProduct,
                            triggers,
                            date: now,
                            stored,
                            previousOfferPrice,
                            previousNormalPrice,
                            validEntities: verifiedEntities,
                            storeMap
                        });
                    }
                }

                if (stored.name !== product.name) {
                    stored.name = product.name;
                    productChanged = true;
                }

                if (productChanged) {
                    hasChanges = true;
                    // Update the state with the modified copy
                    newState[productId] = stored;
                }
            }

            if (hasChanges) {
                await this.saveState(newState);
                this.state = newState;
            }
        } catch (error) {
            logger.error('Error checking %s:', this.name, error);
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
            statusText = '🔥 Nuevos mínimos históricos';
            color = 0x2ecc71;
        } else if (bothBackToLow) {
            statusText = '♻️ Volvió a precios históricos';
            showDate = true;
            triggerDate = stored?.minOfferDate;
        } else if (triggers.length > 1) {
            statusText = '🔥 Nuevos precios históricos';
            color = 0x2ecc71;
        } else {
            const type = triggers[0];
            const notificationConfig = {
                'NEW_LOW_OFFER': { text: '💳 Nuevo mínimo histórico en Oferta', color: 0x2ecc71 },
                'BACK_TO_LOW_OFFER': { text: '💳 Volvió al mínimo histórico en Oferta', showDate: true, date: stored?.minOfferDate },
                'NEW_LOW_NORMAL': { text: '💰 Nuevo mínimo histórico con todo medio de pago', color: 0x27ae60 },
                'BACK_TO_LOW_NORMAL': { text: '💰 Volvió al mínimo histórico con todo medio de pago', showDate: true, date: stored?.minNormalDate }
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
        // Filter out nulls and invalid images (including placeholder like not_found.png)
        // We skip extension check here because downloadImage can sniff the buffer for valid images
        // even if the URL doesn't have a standard extension.
        const candidateUrls = [...new Set(allUrls.filter(url => !solotodo.isPictureUrlInvalid(url, { skipExtensionCheck: true })))];

        for (const url of candidateUrls) {
            try {
                const { buffer, extension } = await downloadImage(url);
                const fileName = `product_${product.id}.${extension}`;
                return new Discord.AttachmentBuilder(buffer, { name: fileName });
            } catch (error) {
                logger.error('[DealMonitor] Failed to download fallback image for product %s from %s:', product.id, url, error);
            }
        }
        return null;
    }

    /**
     * Formats a store entity into a displayable name and a safe URL.
     * @private
     * @param {object} product The product object.
     * @param {object} entity The Solotodo entity.
     * @param {Map<string, string>} storeMap Map of store URLs to names.
     * @returns {{storeName: string, safeUrl: string}} The sanitized store name and URL.
     */
    _formatStoreLink(product, entity, storeMap) {
        const storeData = storeMap ? storeMap.get(entity.store) : null;
        const storeName = sanitizeLinkText(storeData?.name || 'Tienda');
        const safeUrl = toSafeMarkdownUrl(entity.external_url);
        if (safeUrl === '#' && entity.external_url) {
            logger.warn('[DealMonitor] Invalid external URL for product %s (store: %s): %s', product.id, entity.store, String(entity.external_url).replace(/[\n\r]/g, ' '));
        }
        return { storeName, safeUrl };
    }

    /**
     * Sends a notification about a deal.
     * @param {object} change The change details.
     */
    async notify(change) {
        let { product, triggers, stored, type, previousOfferPrice, previousNormalPrice } = change;
        
        // Backward compatibility
        if (!triggers && type) triggers = [type];
        if (!Array.isArray(triggers)) triggers = [];

        const channel = this.getNotificationChannel();
        if (!channel) return;

        // 1. Fetch Data
        const storeMap = change.storeMap || await solotodo.getStores();
        const validEntities = Array.isArray(change.validEntities)
            ? change.validEntities
            : solotodo.filterValidEntities(await solotodo.getAvailableEntities(product.id), storeMap);
        const pictureUrl = await solotodo.getBestPictureUrl(product, validEntities);

        // 2. Validate
        if (validEntities.length === 0) return;

        // Determine target price based on triggers
        const priceKey = solotodo.determinePriceKey(triggers);
        
        // Find the minimum price and all entities matching it in a single pass
        const { bestEntities } = solotodo.findBestEntities(validEntities, priceKey, MIN_SANITY_PRICE);

        if (bestEntities.length === 0) return;

        // 3. Prepare Metadata
        const sanitizedName = sanitizeLinkText(product.name);
        const { description, color } = this._getNotificationMetadata(triggers, stored);

        // 4. Build Embed
        const offerPriceValue = formatPriceValue(product.offerPrice, previousOfferPrice);
        const normalPriceValue = formatPriceValue(product.normalPrice, previousNormalPrice);

        // Calculate dynamic offer label based on bestEntities
        let offerLabel = 'Precio Oferta';
        if (bestEntities.length === 1) {
            const entity = bestEntities[0];
            const storeData = storeMap ? storeMap.get(entity.store) : null;
            if (product.offerPrice === product.normalPrice) {
                offerLabel = 'Con todo medio de pago';
            } else if (storeData && storeData.preferred_payment_method) {
                offerLabel = storeData.preferred_payment_method;
            } else {
                offerLabel = 'Precio efectivo';
            }
        }

        // Determine the primary store link for the embed title
        let primaryStoreUrl = solotodo.getProductUrl(product); // fallback
        if (bestEntities.length > 0) {
            const sortedBest = [...bestEntities].sort((a, b) => {
                const aNoCard = parseFloat(a.active_registry.offer_price) === parseFloat(a.active_registry.normal_price);
                const bNoCard = parseFloat(b.active_registry.offer_price) === parseFloat(b.active_registry.normal_price);
                if (aNoCard && !bNoCard) return -1;
                if (!aNoCard && bNoCard) return 1;

                const aNormal = parseFloat(a.active_registry.normal_price);
                const bNormal = parseFloat(b.active_registry.normal_price);
                if (aNormal !== bNormal) return aNormal - bNormal;

                return 0;
            });
            const { safeUrl } = this._formatStoreLink(product, sortedBest[0], storeMap);
            if (safeUrl !== '#') {
                primaryStoreUrl = safeUrl;
            }
        }

        const embed = new Discord.EmbedBuilder()
            .setTitle(sanitizedName)
            .setURL(primaryStoreUrl)
            .setDescription(description)
            .setColor(color)
            .setTimestamp()
            .setFooter({ text: 'powered by Solotodo'});

        if (product.offerPrice === product.normalPrice && previousOfferPrice === previousNormalPrice) {
            embed.addFields([
                { name: offerLabel === 'Precio Oferta' ? 'Precio (Todo medio de pago)' : offerLabel, value: offerPriceValue, inline: false }
            ]);
        } else {
            embed.addFields([
                { name: offerLabel, value: offerPriceValue, inline: true },
                { name: 'Precio Normal', value: normalPriceValue, inline: true }
            ]);
        }

        if (bestEntities.length > 0) {
            let fieldLines = [];
            let currentLength = 0;
            
            const MAX_VALUE_LENGTH = 1024;
            const TRUNCATION_BUFFER = 35;
            const SAFE_MAX_LENGTH = MAX_VALUE_LENGTH - TRUNCATION_BUFFER;

            for (const entity of bestEntities) {
                const { storeName, safeUrl } = this._formatStoreLink(product, entity, storeMap);
                let line = `• [**${storeName}** ↗](${safeUrl})`;
                
                if (entity.best_coupon && entity.best_coupon.code) {
                    line += `\n  ↳ Cupón: \`${entity.best_coupon.code}\``;
                }

                if (currentLength + line.length + 2 > SAFE_MAX_LENGTH) {
                    fieldLines.push(`*... y ${bestEntities.length - fieldLines.length} tienda(s) más*`);
                    break;
                }
                fieldLines.push(line);
                currentLength += line.length + 2; 
            }
            embed.addFields([{ name: 'Dónde comprar', value: fieldLines.join('\n'), inline: false }]);
        }

        // 5. Handle Image / Attachment
        let attachment = null;
        if (pictureUrl) {
            embed.setThumbnail(pictureUrl);
        } else {
            attachment = await this._getFallbackAttachment(product, validEntities);
            if (attachment) {
                embed.setThumbnail(`attachment://${attachment.name}`);
            }
        }

        // 6. Send
        if (this.config.verboseLogging) {
            const minOffer = stored?.minOfferPrice != null ? formatCLP(stored.minOfferPrice) : 'N/A';
            const minNormal = stored?.minNormalPrice != null ? formatCLP(stored.minNormalPrice) : 'N/A';
            logger.info('[DealMonitor] Raising Discord alert for %s (ID: %s). Triggers: %s. Current: %s/%s. Min: %s/%s', product.name, product.id, triggers.join(', '), formatCLP(product.offerPrice), formatCLP(product.normalPrice), minOffer, minNormal);
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
                logger.error('Error creating thread for deal %s:', product.id, threadError);
            }
        }
    }
}

module.exports = DealMonitor;
