const got = require('got');
const { getSafeGotOptions } = require('./network');
const logger = require('./logger');
const {
    SOLOTODO_BASE_URL,
    SOLOTODO_API_URL,
    SOLOTODO_CLP_CURRENCY_ID,
    SOLOTODO_USD_CURRENCY_ID,
    SOLOTODO_CLP_CURRENCY_URL,
    SOLOTODO_USD_CURRENCY_URL,
    CHILE_COUNTRY_ID,
    REFURBISHED_CONDITION_URL,
    NEW_CONDITION_URL,
    MIN_DESCRIPTIVE_SLUG_LENGTH,
    MAX_SKU_LIKE_SLUG_LENGTH,
    SOLOTODO_AVAILABILITY_CHECK_LIMIT,
    BANNED_PICTURE_DOMAINS,
    APPLE_PRODUCTS
} = require('./constants');

/**
 * Generates a Solotodo product URL.
 * @param {object} product The product object.
 * @returns {string} The formatted URL.
 */
function getProductUrl(product) {
    return `${SOLOTODO_BASE_URL}/products/${product.id}-${encodeURIComponent(product.slug)}`;
}

/**
 * Generates a Solotodo search URL.
 * @param {string} query The search query.
 * @returns {string} The formatted URL.
 */
function getSearchUrl(query) {
    return `${SOLOTODO_BASE_URL}/search?search=${encodeURIComponent(query)}`;
}

/**
 * Finds the best product match from a list, prioritizing Apple products.
 * @param {Array<object>} products The list of products to check.
 * @returns {object|null} The best matching product or null.
 */
function findBestMatch(products) {
    const appleMatch = products.find(p => p.name.toLowerCase().startsWith('apple'));
    if (appleMatch) return appleMatch;
    return products.length > 0 ? products[0] : null;
}

/**
 * Searches Solotodo for a product.
 * @param {string} query The search query.
 * @returns {Promise<object|null>} The first product found or null.
 */
async function searchSolotodo(query) {
    const url = new URL(`${SOLOTODO_API_URL}/products/`);
    url.searchParams.set('search', query);
    const response = await got(url.toString(), {
        ...getSafeGotOptions(),
        responseType: 'json'
    });

    if (response.body.results && response.body.results.length > 0) {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(' ').filter(w => w.length > 0);

        // Filter results that contain all query words
        const matches = response.body.results.filter(product => {
            const productName = product.name.toLowerCase();
            return queryWords.every(word => productName.includes(word));
        });

        if (matches.length > 0) {
            // Check availability for top matches to prioritize in-stock results
            const topMatches = matches.slice(0, SOLOTODO_AVAILABILITY_CHECK_LIMIT);
            const availUrl = new URL(`${SOLOTODO_API_URL}/products/available_entities/`);
            availUrl.searchParams.set('countries', CHILE_COUNTRY_ID);
            // Use a single 'ids' parameter with comma-separated values
            availUrl.searchParams.set('ids', topMatches.map(p => p.id).join(','));

            try {
                const availRes = await got(availUrl.toString(), {
                    ...getSafeGotOptions(),
                    responseType: 'json'
                });

                const availabilityMap = new Map();
                if (availRes.body.results) {
                    for (const res of availRes.body.results) {
                        const validEntities = filterValidEntities(res.entities);
                        availabilityMap.set(res.product.id, validEntities.length > 0);
                    }
                }

                // Filter in-stock products once
                const inStockProducts = topMatches.filter(p => availabilityMap.get(p.id));
                
                const bestInStock = findBestMatch(inStockProducts);
                if (bestInStock) return bestInStock;

            } catch (err) {
                // We log the error but allow the search to proceed to fallback logic (non-stock-aware)
                // so the user still gets a result even if the availability check fails.
                logger.error('Error checking product availability during search (URL: %s):', availUrl.toString(), err);
            }

            // Fallback to searching all matches
            return findBestMatch(matches);
        }

        // If no matches found with all words, return null to avoid misleading results
        return null;
    }
    return null;
}

/**
 * Extracts a search query from a message content or URL.
 * @param {string} content The message content.
 * @returns {string|null} The extracted query or null.
 */
function extractQuery(content) {
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    let url = null;

    if (urlMatch) {
        try {
            url = new URL(urlMatch[0]);
        } catch (e) {
            logger.error('Error parsing URL for query extraction:', e);
        }
    }

    // 1. Highest Priority: Extract known Apple products from URL if present
    if (url) {
        const pathSlug = url.pathname.toLowerCase();
        for (const product of APPLE_PRODUCTS) {
            const slugPart = product.toLowerCase().replace(/\s+/g, '-');
            const slugPartSpace = product.toLowerCase().replace(/\s+/g, ' ');

            if (pathSlug.includes(slugPart) || pathSlug.includes(slugPartSpace)) {
                return product;
            }
        }
    }

    // 2. Second Priority: Extract descriptive slug from URL
    if (url) {
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        // Iterate backwards to find the first descriptive segment
        while (pathParts.length > 0) {
            const part = pathParts.pop();
            let slug = part.replace(/[-_]/g, ' ').replace(/\.html?$/, '');
            
            try {
                slug = decodeURIComponent(slug);
            } catch (e) {
                logger.error('Failed to decode URL part "%s":', part, e);
            }

            // Security: Sanitize potential path traversal characters
            slug = slug.replace(/(\.\.|[/\\])/g, ' ');

            const trimmedSlug = slug.trim();
            if (!trimmedSlug) continue;

            // Skip purely numeric segments
            if (/^\d+$/.test(trimmedSlug)) continue;

            // Skip very short segments unless they match a known product exactly (unlikely for segments)
            // or if it's the only segment we have.
            if (trimmedSlug.length < MIN_DESCRIPTIVE_SLUG_LENGTH && pathParts.length > 0) continue;

            // If it looks like a SKU (short, mixed letters and numbers), keep looking if there are more segments
            if (trimmedSlug.length <= MAX_SKU_LIKE_SLUG_LENGTH && /\d/.test(trimmedSlug) && /[a-z]/i.test(trimmedSlug) && pathParts.length > 0) continue;

            return trimmedSlug;
        }
    }

    // 3. Third Priority: Extract known Apple products from message text
    const textOnly = content.replace(/https?:\/\/[^\s]+/g, '').trim();
    const lowerText = textOnly.toLowerCase();

    for (const product of APPLE_PRODUCTS) {
        if (lowerText.includes(product.toLowerCase())) {
            return product;
        }
    }

    // 4. Fallback: Clean up the text manually if it's not a URL-only message
    if (textOnly) {
        let text = textOnly;
        text = text.replace(/\$[\d.]+/g, ''); // Remove prices
        text = text.replace(/[^a-z0-9\sñáéíóúü]/gi, ' '); // Remove special chars (and underscores)
        text = text.replace(/\s+/g, ' ').trim(); // Collapse spaces

        if (text.length > 3) return text;
    }

    return null;
}

/**
 * Searches Solotodo for a product by its store URL.
 * @param {string} url The store URL to search for.
 * @returns {Promise<object|null>} The product object if found, or null.
 */
async function searchByUrl(url) {
    try {
        const apiUrl = new URL(`${SOLOTODO_API_URL}/entities/by_url/`);
        apiUrl.searchParams.set('url', url);
        const response = await got(apiUrl.toString(), {
            ...getSafeGotOptions(),
            responseType: 'json'
        });

        if (response.body && response.body.product) {
            const product = response.body.product;

            // Augment with picture from entity if missing on product
            if (!product.picture_url && response.body.picture_urls && response.body.picture_urls.length > 0) {
                product.picture_url = response.body.picture_urls[0];
            }

            // Extract slug from URL if missing (by_url returns a lite product)
            if (!product.slug && product.url) {
                try {
                    const urlObj = new URL(product.url);
                    const parts = urlObj.pathname.split('/').filter(Boolean);
                    product.slug = parts.pop();
                } catch (e) {
                    logger.error('Error parsing product URL for slug extraction:', e);
                }
            }

            return product;
        }
        return null;
    } catch (error) {
        // 404 is expected if the URL is not tracked by Solotodo
        if (error.response && error.response.statusCode === 404) {
            return null;
        }
        // Let other errors propagate
        throw error;
    }
}

/**
 * Fetches available entities for a product.
 * @param {number|string} productId The product ID.
 * @param {boolean} [excludeRefurbished=true] Whether to exclude refurbished entities.
 * @returns {Promise<Array>} List of entities.
 */
async function getAvailableEntities(productId, excludeRefurbished = true) {
    const url = new URL(`${SOLOTODO_API_URL}/products/available_entities/`);
    url.searchParams.set('countries', CHILE_COUNTRY_ID);
    url.searchParams.set('ids', String(productId));
    if (excludeRefurbished) {
        url.searchParams.set('exclude_refurbished', 'true');
    }
    
    const response = await got(url.toString(), {
        ...getSafeGotOptions(),
        responseType: 'json'
    });

    if (response.body.results && response.body.results.length > 0) {
        return response.body.results[0].entities || [];
    }
    return [];
}

/**
 * Attempts to find a better picture URL if the current one is problematic (e.g. missing extension or from travel.cl).
 * @param {object} product The product object.
 * @param {Array} [entities] Optional pre-fetched entities.
 * @returns {Promise<string>} The best available picture URL.
 */
async function getBestPictureUrl(product, entities = null) {
    const currentUrl = product.pictureUrl || product.picture_url;
    
    /**
     * Checks if a URL is invalid or blocked.
     * @param {string} url The URL to check.
     * @returns {boolean} True if invalid.
     */
    const isInvalid = (url) => {
        if (!url) return true;

        try {
            const hostname = new URL(url).hostname;
            if (BANNED_PICTURE_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
                return true;
            }
        } catch (e) {
            logger.warn('[Solotodo] URL parsing failed for "%s": %s', url, e.message);
            return true;
        }

        return !/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
    };

    if (!isInvalid(currentUrl)) {
        logger.info('[Solotodo] Picture selected for product %s: %s', product.id, currentUrl);
        return currentUrl;
    }

    logger.info('[Solotodo] Invalid picture URL for product %s: %s', product.id, currentUrl);

    try {
        // Try to find an image from available entities
        const availableEntities = entities || await getAvailableEntities(product.id);
        for (const entity of availableEntities) {
            if (entity.picture_urls && Array.isArray(entity.picture_urls) && entity.picture_urls.length > 0) {
                const entityUrl = entity.picture_urls[0];
                if (!isInvalid(entityUrl)) {
                    logger.info('[Solotodo] Alternative picture selected for product %s: %s', product.id, entityUrl);
                    return entityUrl;
                }
            }
        }
    } catch (e) {
        logger.error('Error fetching alternative picture for product %s:', product.id, e);
    }

    logger.info('[Solotodo] No alternative picture found for product %s', product.id);
    return null;
}

let cachedStores = null;
let storesLastUpdated = 0;
const STORES_CACHE_TTL = 3600000; // 1 hour

/**
 * Fetches all stores from Solotodo.
 * @returns {Promise<Map<string, string>>} A map of store URL to store name.
 */
async function getStores() {
    const now = Date.now();
    if (cachedStores && (now - storesLastUpdated < STORES_CACHE_TTL)) {
        return cachedStores;
    }

    const response = await got(`${SOLOTODO_API_URL}/stores/`, {
        ...getSafeGotOptions(),
        responseType: 'json'
    });

    const storeMap = new Map();
    if (Array.isArray(response.body)) {
        for (const store of response.body) {
            storeMap.set(store.url, store.name);
        }
    }
    cachedStores = storeMap;
    storesLastUpdated = now;
    return storeMap;
}

/**
 * Fetches the pricing history of a product.
 * @param {number|string} productId The product ID.
 * @returns {Promise<Array>} List of entity pricing histories.
 */
async function getProductHistory(productId) {
    // Fetch last 6 months of history by default to find a good minimum
    const timestampBefore = new Date().toISOString();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const timestampAfter = sixMonthsAgo.toISOString();

    const url = new URL(`${SOLOTODO_API_URL}/products/${productId}/pricing_history/`);
    url.searchParams.set('timestamp_after', timestampAfter);
    url.searchParams.set('timestamp_before', timestampBefore);
    url.searchParams.set('exclude_refurbished', 'true');

    const response = await got(url.toString(), {
        ...getSafeGotOptions(),
        responseType: 'json'
    });

    return response.body || [];
}

/**
 * Filters valid entities from a list (excludes plans and refurbished).
 * @param {Array} entities List of entities.
 * @returns {Array} List of valid entities.
 */
function filterValidEntities(entities) {
    if (!entities || !Array.isArray(entities)) return [];
    return entities.filter(entity => {
        const isPlan = entity.active_registry?.cell_monthly_payment != null;
        const isRefurbished = entity.condition === REFURBISHED_CONDITION_URL;
        return !isPlan && !isRefurbished;
    });
}

/**
 * Determines the price key to use based on triggers.
 * @param {Array<string>} triggers List of triggers.
 * @returns {string} The price key ('offer_price' or 'normal_price').
 */
function determinePriceKey(triggers = []) {
    const safeTriggers = Array.isArray(triggers) ? triggers : [];
    return safeTriggers.some(t => t.includes('OFFER')) ? 'offer_price' : 'normal_price';
}

/**
 * Finds the minimum price and all entities matching it in a single pass.
 * @param {Array} entities List of valid entities.
 * @param {string} priceKey The price key to check.
 * @param {number} minSanityPrice The minimum price to consider valid.
 * @returns {{minPrice: number, bestEntities: Array}} The minimum price and the matching entities.
 */
function findBestEntities(entities, priceKey, minSanityPrice) {
    if (!entities || !Array.isArray(entities)) return { minPrice: Infinity, bestEntities: [] };
    
    return entities.reduce((acc, entity) => {
        const p = parseFloat(entity.active_registry?.[priceKey]);

        // Ignore invalid or unsanitary prices
        if (isNaN(p) || p < minSanityPrice) {
            return acc;
        }

        // If we found a new minimum, reset the list
        if (p < acc.minPrice) {
            return { minPrice: p, bestEntities: [entity] };
        }
        
        // If it's the same minimum, add to the list
        if (p === acc.minPrice) {
            acc.bestEntities.push(entity);
        }

        return acc;
    }, { minPrice: Infinity, bestEntities: [] });
}

module.exports = {
    SOLOTODO_BASE_URL,
    SOLOTODO_API_URL,
    SOLOTODO_CLP_CURRENCY_ID,
    SOLOTODO_USD_CURRENCY_ID,
    SOLOTODO_CLP_CURRENCY_URL,
    SOLOTODO_USD_CURRENCY_URL,
    CHILE_COUNTRY_ID,
    REFURBISHED_CONDITION_URL,
    NEW_CONDITION_URL,
    searchSolotodo,
    extractQuery,
    searchByUrl,
    getProductUrl,
    getSearchUrl,
    getAvailableEntities,
    getStores,
    getProductHistory,
    getBestPictureUrl,
    filterValidEntities,
    determinePriceKey,
    findBestEntities
};