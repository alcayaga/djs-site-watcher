const got = require('got');
const { getSafeGotOptions } = require('./network');
const logger = require('./logger');

const MIME_TYPE_MAP = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

const SUPPORTED_EXTENSIONS = Object.values(MIME_TYPE_MAP);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const { getFileTypeFromBuffer } = require('./fileTypeWrapper');

/**
 * Sniffs the image extension from a buffer's magic numbers using file-type.
 * Supports standard image formats.
 * @param {Buffer} buffer The image buffer.
 * @returns {Promise<string|null>} The extension or null if not recognized.
 */
async function sniffImageExtension(buffer) {
    if (!buffer || buffer.length === 0) return null;
    
    try {
        const type = await getFileTypeFromBuffer(buffer);
        
        if (!type) return null;
        
        // We only care about specific image types
        if (SUPPORTED_EXTENSIONS.includes(type.ext)) {
            return type.ext;
        }
        
        return null;
    } catch (error) {
        logger.error('Error sniffing image extension:', error);
        return null;
    }
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
        extension = await sniffImageExtension(buffer);
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
