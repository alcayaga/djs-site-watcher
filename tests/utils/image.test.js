const { downloadImage, sniffImageExtension, MAX_IMAGE_SIZE } = require('../../src/utils/image');
const got = require('got');

jest.mock('got', () => {
    const gotMock = jest.fn();
    gotMock.stream = jest.fn();
    return gotMock;
});

jest.mock('../../src/utils/network', () => ({
    getSafeGotOptions: jest.fn().mockReturnValue({})
}));

describe('Image Utility', () => {
    describe('sniffImageExtension', () => {
        it('should detect JPEG', () => {
            const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            expect(sniffImageExtension(buffer)).toBe('jpg');
        });

        it('should detect PNG', () => {
            const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            expect(sniffImageExtension(buffer)).toBe('png');
        });

        it('should detect GIF', () => {
            const buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            expect(sniffImageExtension(buffer)).toBe('gif');
        });

        it('should detect WebP', () => {
            const buffer = Buffer.from('RIFFxxxxWEBP');
            expect(sniffImageExtension(buffer)).toBe('webp');
        });

        it('should return null for unknown types', () => {
            const buffer = Buffer.from('UNKNOWNDATA');
            expect(sniffImageExtension(buffer)).toBeNull();
        });

        it('should return null for short buffers', () => {
            const buffer = Buffer.from('SHORT');
            expect(sniffImageExtension(buffer)).toBeNull();
        });

        it('should return null for null/undefined buffer', () => {
            expect(sniffImageExtension(null)).toBeNull();
            expect(sniffImageExtension(undefined)).toBeNull();
        });
    });

    describe('downloadImage', () => {
        const mockUrl = 'http://example.com/image.jpg';

        const mockGotStream = (chunks = ['fake-image-data'], headers = { 'content-type': 'image/jpeg' }) => {
            const stream = new (require('events').EventEmitter)();
            let destroyed = false;
            stream.destroy = jest.fn((err) => {
                destroyed = true;
                if (err) process.nextTick(() => stream.emit('error', err));
            });
            process.nextTick(() => {
                if (destroyed) return;
                stream.emit('response', { headers });
                if (destroyed) return;
                chunks.forEach(chunk => {
                    if (!destroyed) stream.emit('data', Buffer.from(chunk));
                });
                if (!destroyed) stream.emit('end');
            });
            return stream;
        };

        const mockGotStreamError = (error) => {
            const stream = new (require('events').EventEmitter)();
            stream.destroy = jest.fn();
            process.nextTick(() => {
                stream.emit('error', error);
            });
            return stream;
        };

        it('should download and return buffer and extension for valid image', async () => {
            got.stream.mockImplementation(() => mockGotStream(['fake-data'], { 'content-type': 'image/jpeg' }));

            const result = await downloadImage(mockUrl);
            expect(result.buffer.toString()).toBe('fake-data');
            expect(result.extension).toBe('jpg');
        });

        it('should infer extension from buffer if content-type is generic', async () => {
            // PNG signature
            const pngData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
            got.stream.mockImplementation(() => mockGotStream([pngData], { 'content-type': 'application/octet-stream' }));

            const result = await downloadImage(mockUrl);
            expect(result.buffer).toEqual(pngData);
            expect(result.extension).toBe('png');
        });

        it('should fail if image is too large', async () => {
            const largeData = Buffer.alloc(MAX_IMAGE_SIZE + 100);
            
            got.stream.mockImplementation(() => {
                const stream = new (require('events').EventEmitter)();
                let destroyed = false;
                stream.destroy = jest.fn((err) => {
                    destroyed = true;
                    if (err) process.nextTick(() => stream.emit('error', err));
                });
                process.nextTick(() => {
                    if (destroyed) return;
                    stream.emit('response', { headers: { 'content-type': 'image/jpeg' } });
                    if (destroyed) return;
                    stream.emit('data', largeData);
                });
                return stream;
            });

            await expect(downloadImage(mockUrl)).rejects.toThrow('Image too large');
        });

        it('should fail if content-type is definitely not an image', async () => {
            got.stream.mockImplementation(() => mockGotStream(['<html></html>'], { 'content-type': 'text/html' }));

            await expect(downloadImage(mockUrl)).rejects.toThrow('Resource is definitely not an image');
        });

        it('should fail if content is not a supported image type (sniffing fails)', async () => {
            got.stream.mockImplementation(() => mockGotStream(['random data'], { 'content-type': 'application/octet-stream' }));

            await expect(downloadImage(mockUrl)).rejects.toThrow('Resource content is not a supported image type');
        });
        
        it('should fail on stream error', async () => {
             got.stream.mockImplementation(() => mockGotStreamError(new Error('Network error')));
             
             await expect(downloadImage(mockUrl)).rejects.toThrow('Network error');
        });
    });
});
