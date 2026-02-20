let fileTypeModule;
const logger = require('./logger');

/**
 * Wrapper for file-type dynamic import to facilitate testing.
 * @param {Buffer} buffer 
 * @returns {Promise<{ext: string, mime: string}|undefined>}
 */
async function getFileTypeFromBuffer(buffer) {
    try {
        if (!fileTypeModule) {
            fileTypeModule = await import('file-type');
        }
        return await fileTypeModule.fileTypeFromBuffer(buffer);
    } catch (error) {
        logger.error('Failed to get file type from buffer in wrapper:', error);
        // Fallback or error handling if needed, though usually this shouldn't fail in prod
        return undefined;
    }
}

module.exports = {
    getFileTypeFromBuffer
};
