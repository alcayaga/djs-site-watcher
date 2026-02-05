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
    const lowerContent = content.toLowerCase();
    const urlMatch = content.match(/https?:\/\/[^\s]+/);

    // 1. Priority: Extract from URL if present
    if (urlMatch) {
        try {
            const url = new URL(urlMatch[0]);
            const pathSlug = url.pathname.toLowerCase();
            
            // Check if the URL slug contains a known Apple product
            for (const product of APPLE_PRODUCTS) {
                // We sanitize the product name for URL matching (e.g. "iPhone 13 Pro" -> "iphone-13-pro" or "iphone 13 pro")
                // Simple check: remove spaces from product and check if slug includes it, 
                // OR check if slug includes the product name with hyphens.
                const slugPart = product.toLowerCase().replace(/\s+/g, '-');
                const slugPartSpace = product.toLowerCase().replace(/\s+/g, ' '); // some urls use spaces or %20
                
                if (pathSlug.includes(slugPart) || pathSlug.includes(slugPartSpace)) {
                    return product;
                }
            }

            // If no known product in URL, proceed to text fallback? 
            // Or try to use the raw slug? 
            // Often if the URL doesn't match a known product, it might be a weird link or a specific variant not in our list.
            // Let's fallback to text search, but exclude the URL from it.
        } catch (e) {
            console.error('Error parsing URL for query extraction:', e);
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
        text = text.replace(/[^\w\sñáéíóúü]/gi, ' '); // Remove special chars
        text = text.replace(/\s+/g, ' ').trim(); // Collapse spaces
        
        if (text.length > 3) return text;
    }

    // 5. Last resort: If we had a URL but no known product, try to use the slug as a query
    if (urlMatch) {
         try {
            const url = new URL(urlMatch[0]);
            const pathParts = url.pathname.split('/');
            let bestPart = '';
            for (const part of pathParts) {
                if (part.length > bestPart.length) bestPart = part;
            }
            if (bestPart) {
                let slug = bestPart.replace(/[-_]/g, ' ').replace(/\.html?$/, '');
                try { slug = decodeURIComponent(slug); } catch (e) {}
                return slug.trim();
            }
        } catch (e) {}
    }

    return null;
}

module.exports = { searchSolotodo, extractQuery };