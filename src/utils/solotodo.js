const got = require('got');
const { getSafeGotOptions } = require('./network');
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
        // Prioritize results that start with "Apple" to avoid accessories or knock-offs
        const appleResult = response.body.results.find(product =>
            product.name.toLowerCase().startsWith('apple') &&
            // Ensure the result actually contains the query terms (e.g. searching "AirPods Pro" shouldn't return base "AirPods")
            query.split(' ').every(word => product.name.toLowerCase().includes(word.toLowerCase()))
        );

        if (appleResult) return appleResult;

        // Fallback: Return first result if no "Apple" match found (though unlikely for this bot)
        return response.body.results[0];
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
            console.error('Error parsing URL for query extraction:', e);
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
                console.error(`Failed to decode URL part "${part}":`, e);
            }

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
                    console.error('Error parsing product URL for slug extraction:', e);
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
            console.warn(`[Solotodo] URL parsing failed for "${url}": ${e.message}`);
            return true;
        }

        return !/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
    };

    if (!isInvalid(currentUrl)) {
        console.log(`[Solotodo] Picture selected for product ${product.id}: ${currentUrl}`);
        return currentUrl;
    }

    console.log(`[Solotodo] Invalid picture URL for product ${product.id}: ${currentUrl}`);

    try {
        // Try to find an image from available entities
        const availableEntities = entities || await getAvailableEntities(product.id);
        for (const entity of availableEntities) {
            if (entity.picture_urls && Array.isArray(entity.picture_urls) && entity.picture_urls.length > 0) {
                const entityUrl = entity.picture_urls[0];
                if (!isInvalid(entityUrl)) {
                    console.log(`[Solotodo] Alternative picture selected for product ${product.id}: ${entityUrl}`);
                    return entityUrl;
                }
            }
        }
    } catch (e) {
        console.error(`Error fetching alternative picture for product ${product.id}:`, e);
    }

    console.log(`[Solotodo] No alternative picture found for product ${product.id}`);
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
 * Finds the best entity from a list based on price and conditions.
 * @param {Array} entities List of entities.
 * @param {Array<string>} triggers List of triggers (e.g. ['NEW_LOW_OFFER']).
 * @returns {object|null} The best entity or null.
 */
function findBestEntity(entities, triggers = []) {
    if (!entities || entities.length === 0) return null;

    const priceKey = triggers.some(t => t.includes('OFFER')) ? 'offer_price' : 'normal_price';
    let bestEntity = null;
    let minPrice = Infinity;

    for (const entity of entities) {
        const price = parseFloat(entity.active_registry?.[priceKey]);
        const isPlan = entity.active_registry?.cell_monthly_payment != null;
        const isRefurbished = entity.condition === REFURBISHED_CONDITION_URL;
        
        if (!isPlan && !isRefurbished && !isNaN(price) && price < minPrice) {
            minPrice = price;
            bestEntity = entity;
        }
    }

    return bestEntity;
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
    findBestEntity
};