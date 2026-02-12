const got = require('got');
const { getSafeGotOptions } = require('./network');

const MIME_TYPE_MAP = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Sniffs the image extension from a buffer's magic numbers.
 * Supports JPEG, PNG, GIF and WebP.
 * @param {Buffer} buffer The image buffer.
 * @returns {string|null} The extension or null if not recognized.
 */
function sniffImageExtension(buffer) {
    if (!buffer || buffer.length < 12) return null;
    
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
    
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
    
    // GIF: 47 49 46 38 ("GIF8")
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'gif';
    
    // WebP: RIFF .... WEBP
    if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'webp';
    
    return null;
}

/**
 * Downloads an image from a URL, enforcing size limits and type checks.
 * @param {string} url The URL of the image to download.
 * @returns {Promise<{buffer: Buffer, extension: string}>} The image buffer and its extension.
 * @throws {Error} If the download fails, the image is too large, or the type is invalid.
 */
async function downloadImage(url) {
    const stream = got.stream(url, {
        ...getSafeGotOptions(),
        timeout: { request: 5000 }
    });

    const chunks = [];
    let receivedLength = 0;
    let contentType = null;

    await new Promise((resolve, reject) => {
        stream.on('response', (res) => {
            contentType = res.headers['content-type'];
            // Early reject for definitely non-image types
            const pureType = contentType ? contentType.split(';')[0].trim() : null;
            const isPotentiallyImage = !pureType || 
                                       pureType === 'application/octet-stream' || 
                                       pureType.startsWith('image/');
            
            if (!isPotentiallyImage) {
                stream.destroy(new Error('Resource is definitely not an image'));
            }
        });
        
        stream.on('data', (chunk) => {
            receivedLength += chunk.length;
            if (receivedLength > MAX_IMAGE_SIZE) {
                stream.destroy(new Error('Image too large'));
            } else {
                chunks.push(chunk);
            }
        });
        
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
    });

    const buffer = Buffer.concat(chunks);

    // Determine extension from Content-Type header first
    let extension = '';
    if (contentType) {
        const pureType = contentType.split(';')[0].trim();
        extension = MIME_TYPE_MAP[pureType];
    }

    // If not found by Content-Type (e.g. octet-stream), try sniffing the buffer
    if (!extension) {
        extension = sniffImageExtension(buffer);
    }

    // Final security check
    if (!extension) {
        throw new Error('Resource content is not a supported image type');
    }

    return { buffer, extension };
}

module.exports = {
    sniffImageExtension,
    downloadImage,
    MIME_TYPE_MAP,
    MAX_IMAGE_SIZE
};
