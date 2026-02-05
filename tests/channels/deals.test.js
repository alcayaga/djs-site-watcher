const DealsChannel = require('../../src/channels/deals.js');

describe('DealsChannel', () => {
    let handler;
    let mockMessage;
    let mockState;
    let mockConfig;
    let handlerConfig;

    beforeEach(() => {
        handlerConfig = {
            channelId: '456'
        };
        handler = new DealsChannel('Deals', handlerConfig);
        mockMessage = {
            author: { 
                bot: false,
                username: 'testuser',
                send: jest.fn().mockResolvedValue({})
            },
            channel: { id: '456' },
            content: 'Check this out!',
            attachments: new Map(),
            delete: jest.fn().mockResolvedValue({}),
            startThread: jest.fn().mockResolvedValue({}),
        };
        mockState = {};
        mockConfig = {};
    });

    it('should allow message with link and create thread', async () => {
        const content = 'Great deal here: https://example.com';
        mockMessage.content = content;
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
        expect(mockMessage.delete).not.toHaveBeenCalled();
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: content.substring(0, 100),
            autoArchiveDuration: 10080
        });
    });

    it('should allow message with attachment and create thread', async () => {
        mockMessage.attachments.set('1', {});
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
        expect(mockMessage.delete).not.toHaveBeenCalled();
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: mockMessage.content.substring(0, 100),
            autoArchiveDuration: 10080
        });
    });

    it('should use Spanish fallback name when content is empty but has attachment', async () => {
        mockMessage.content = '';
        mockMessage.attachments.set('1', {});
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: 'Discusión de la oferta',
            autoArchiveDuration: 10080
        });
    });

    it('should use Spanish fallback name when content is only whitespace but has attachment', async () => {
        mockMessage.content = '   ';
        mockMessage.attachments.set('1', {});
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: 'Discusión de la oferta',
            autoArchiveDuration: 10080
        });
    });

    it('should delete and notify for message without link or attachment in Spanish', async () => {
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(true);
        expect(mockMessage.delete).toHaveBeenCalled();
        expect(mockMessage.startThread).not.toHaveBeenCalled();
        expect(mockMessage.author.send).toHaveBeenCalledWith(
            expect.stringContaining('tu mensaje en <#456> fue eliminado porque no parece ser una oferta')
        );
    });
});