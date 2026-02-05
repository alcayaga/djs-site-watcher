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
        };
        mockState = {};
        mockConfig = {};
    });

    it('should allow message with link', async () => {
        mockMessage.content = 'Great deal here: https://example.com';
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(true);
        expect(mockMessage.delete).not.toHaveBeenCalled();
    });

    it('should delete and notify for message without link or attachment', async () => {
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(true);
        expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should ignore message in wrong channel', async () => {
        handler.config.channelId = 'wrong';
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(false);
    });
});