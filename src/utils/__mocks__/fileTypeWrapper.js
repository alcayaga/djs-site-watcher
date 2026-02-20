module.exports = {
    getFileTypeFromBuffer: jest.fn(async (buffer) => {
        if (!buffer || buffer.length < 4) return undefined;
        // Simple mock logic matching the test cases
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) return { ext: 'jpg', mime: 'image/jpeg' };
        if (buffer[0] === 0x89 && buffer[1] === 0x50) return { ext: 'png', mime: 'image/png' };
        if (buffer[0] === 0x47 && buffer[1] === 0x49) return { ext: 'gif', mime: 'image/gif' };
        // WebP check: R I F F ... W E B P
        if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return { ext: 'webp', mime: 'image/webp' };
        return undefined;
    }),
};
