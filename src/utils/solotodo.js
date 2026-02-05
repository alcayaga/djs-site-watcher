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

/**
 * Searches Solotodo for a product.
 * @param {string} query The search query.
 * @returns {Promise<object|null>} The first product found or null.
 */
async function searchSolotodo(query) {
    try {
        const response = await got(`https://publicapi.solotodo.com/products?search=${encodeURIComponent(query)}`, {
            responseType: 'json'
        });

        if (response.body.results && response.body.results.length > 0) {
            // Return the first result
            return response.body.results[0];
        }
        return null;
    } catch (error) {
        console.error('Error searching Solotodo:', error);
        return null;
    }
}

/**
 * Extracts a search query from a message content or URL.
 * @param {string} content The message content.
 * @returns {string|null} The extracted query or null.
 */
function extractQuery(content) {
    // 1. First, check if the content contains a known Apple product name.
    // This is the most reliable method for "messy" text like "Vendo iPhone 13 Pro usado"
    const lowerContent = content.toLowerCase();
    for (const product of APPLE_PRODUCTS) {
        if (lowerContent.includes(product.toLowerCase())) {
            return product;
        }
    }

    // 2. If no known product found, try the URL extraction method
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
        try {
            const url = new URL(urlMatch[0]);
            const pathParts = url.pathname.split('/');
            let bestPart = '';
            for (const part of pathParts) {
                if (part.length > bestPart.length) {
                    bestPart = part;
                }
            }

            if (bestPart) {
                let slug = bestPart;
                slug = slug.replace(/[-_]/g, ' ');
                slug = slug.replace(/\.html?$/, '');
                try {
                    slug = decodeURIComponent(slug);
                } catch (e) {
                    // Ignore decode errors
                }
                return slug.trim();
            }
        } catch (e) {
            console.error('Error parsing URL for query extraction:', e);
        }
    }

    // 3. Fallback: Clean up the text manually
    let text = content.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (text) {
        text = text.replace(/\$[\d.]+/g, ''); // Remove prices
        text = text.replace(/[^\w\sñáéíóúü]/gi, ' '); // Remove special chars
        text = text.replace(/\s+/g, ' ').trim(); // Collapse spaces
        
        if (text.length > 3) return text;
    }

    return null;
}

module.exports = { searchSolotodo, extractQuery };