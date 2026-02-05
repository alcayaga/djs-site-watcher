const got = require('got');

// List of known Apple products to prioritize extraction.
// Sorted by specificity (longer strings first) to ensure "Pro Max" matches before "Pro".
const APPLE_PRODUCTS = [
    // iPhone
    'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13 mini', 'iPhone 13',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12 mini', 'iPhone 12',
    'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
    'iPhone SE', 'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
    
    // iPad
    'iPad Pro 12.9', 'iPad Pro 11', 'iPad Pro',
    'iPad Air', 'iPad mini', 'iPad',

    // Mac
    'MacBook Pro', 'MacBook Air', 'MacBook',
    'Mac mini', 'Mac Studio', 'Mac Pro', 'iMac',

    // Watch
    'Apple Watch Ultra', 'Apple Watch Series 9', 'Apple Watch Series 8', 
    'Apple Watch Series 7', 'Apple Watch SE', 'Apple Watch',

    // Audio / Accessories
    'AirPods Max', 'AirPods Pro', 'AirPods',
    'HomePod mini', 'HomePod',
    'Apple TV 4K', 'Apple TV',
    'Studio Display', 'Pro Display XDR',
    'Magic Keyboard', 'Magic Mouse', 'Magic Trackpad', 'Apple Pencil'
];

const SOLOTODO_BASE_URL = 'https://www.solotodo.cl';

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
    const response = await got(`https://publicapi.solotodo.com/products?search=${encodeURIComponent(query)}`, {
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

    // 1. Priority: Extract from URL if present
    if (url) {
        const pathSlug = url.pathname.toLowerCase();

        // Check if the URL slug contains a known Apple product
        for (const product of APPLE_PRODUCTS) {
            const slugPart = product.toLowerCase().replace(/\s+/g, '-');
            const slugPartSpace = product.toLowerCase().replace(/\s+/g, ' ');

            if (pathSlug.includes(slugPart) || pathSlug.includes(slugPartSpace)) {
                return product;
            }
        }
    }

    // 2. Remove URL from content to avoid false positives in random URL strings
    const textOnly = content.replace(/https?:\/\/[^\s]+/g, '').trim();
    const lowerText = textOnly.toLowerCase();

    // 3. Check text for known Apple products
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

    // 5. Last resort: If we had a URL but no known product, try to use the last segment of the path
    if (url) {
        const pathParts = url.pathname.split('/').filter(Boolean);
        const bestPart = pathParts.pop(); // Take the last non-empty segment

        if (bestPart) {
            let slug = bestPart.replace(/[-_]/g, ' ').replace(/\.html?$/, '');
            try {
                slug = decodeURIComponent(slug);
            } catch (e) {
                // Ignore decode errors
            }
            return slug.trim();
        }
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
        const response = await got(`https://publicapi.solotodo.com/entities/by_url/?url=${encodeURIComponent(url)}`, {
            responseType: 'json'
        });

        if (response.body && response.body.product) {
            return response.body.product;
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
 * @returns {Promise<Array>} List of entities.
 */
async function getAvailableEntities(productId) {
    const response = await got(`https://publicapi.solotodo.com/products/available_entities/?countries=1&ids=${productId}`, {
        responseType: 'json'
    });

    if (response.body.results && response.body.results.length > 0) {
        return response.body.results[0].entities || [];
    }
    return [];
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

    const response = await got('https://publicapi.solotodo.com/stores/', {
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

module.exports = {
    searchSolotodo,
    extractQuery,
    searchByUrl,
    getProductUrl,
    getSearchUrl,
    getAvailableEntities,
    getStores
};