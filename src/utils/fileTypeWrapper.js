let fileTypePromise;
const logger = require('./logger');

/**
 * Wrapper for file-type dynamic import to facilitate testing.
 * @param {Buffer} buffer 
 * @returns {Promise<{ext: string, mime: string}|undefined>}
 */
async function getFileTypeFromBuffer(buffer) {
    try {
        if (!fileTypePromise) {
            fileTypePromise = import('file-type');
        }
        const { fileTypeFromBuffer } = await fileTypePromise;
        return await fileTypeFromBuffer(buffer);
    } catch (error) {
        logger.error('Failed to get file type from buffer in wrapper:', error);
        // Fallback or error handling if needed, though usually this shouldn't fail in prod
        return undefined;
    }
}

module.exports = {
    getFileTypeFromBuffer
};
