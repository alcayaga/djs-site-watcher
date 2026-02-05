const got = require('got');

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
    // 1. Remove URLs
    let text = content.replace(/https?:\/\/[^\s]+/g, '').trim();

    // 2. If text remains, clean it up
    if (text) {
        // Remove prices (e.g. $999.990 or 999990)
        text = text.replace(/\$[\d.]+/g, '');
        // Remove "Codigo de descto ..." patterns if common, but maybe just keeping it simple first.
        // Remove special chars
        text = text.replace(/[^\w\sñáéíóúü]/gi, ' ');
        // Collapse spaces
        text = text.replace(/\s+/g, ' ').trim();
        
        if (text.length > 3) return text;
    }

    // 3. If no text, try to extract from URL
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
        try {
            const url = new URL(urlMatch[0]);
            // Try to find a slug in the path
            // e.g. /products/ipad-pro-m4 -> ipad pro m4
            // e.g. /apple/1448009-airpods-pro-3-... -> airpods pro 3
            
            const pathParts = url.pathname.split('/');
            // Look for the longest part, usually the slug
            let bestPart = '';
            for (const part of pathParts) {
                if (part.length > bestPart.length) {
                    bestPart = part;
                }
            }

            if (bestPart) {
                // Heuristic: Remove numbers at start or end if they look like IDs
                let slug = bestPart;
                // Replace hyphens/underscores with spaces
                slug = slug.replace(/[-_]/g, ' ');
                // Remove file extensions
                slug = slug.replace(/\.html?$/, '');
                
                // Decode URI components (e.g. %20)
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

    return null;
}

module.exports = { searchSolotodo, extractQuery };
