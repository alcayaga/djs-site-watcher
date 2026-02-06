const DealsChannel = require('../../src/channels/deals.js');

describe('DealsChannel URL Validation', () => {
    let handler;
    let mockMessage;

    beforeEach(() => {
        handler = new DealsChannel('Deals', { channelId: '456' });
        mockMessage = {
            author: { 
                bot: false,
                displayName: 'testuser',
                send: jest.fn().mockResolvedValue({})
            },
            channel: { id: '456' },
            content: '',
            attachments: new Map(),
            delete: jest.fn().mockResolvedValue({}),
            startThread: jest.fn().mockResolvedValue({
                send: jest.fn().mockResolvedValue({})
            }),
        };
    });

    it('should reject invalid URL schemes', async () => {
        mockMessage.content = 'Check this: ftp://example.com';
        const handled = await handler.handle(mockMessage, {}, {});
        expect(handled).toBe(true);
        expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should reject URLs without a TLD or dot', async () => {
        mockMessage.content = 'Check this: http://localhost';
        const handled = await handler.handle(mockMessage, {}, {});
        expect(handled).toBe(true);
        expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should reject very short/malformed "URLs"', async () => {
        mockMessage.content = 'Check this: http://.';
        const handled = await handler.handle(mockMessage, {}, {});
        expect(handled).toBe(true);
        expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should accept valid URLs with dots', async () => {
        mockMessage.content = 'Check this: https://google.com';
        const handled = await handler.handle(mockMessage, {}, {});
        expect(handled).toBe(false);
        expect(mockMessage.delete).not.toHaveBeenCalled();
    });
});
