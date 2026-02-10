const QAChannel = require('../../src/channels/QAChannel.js');

jest.mock('discord.js');

describe('QAChannel', () => {
    let handler;
    let mockMessage;
    let mockState;
    let handlerConfig;

    beforeEach(() => {
        handlerConfig = {
            channelId: '123'
        };
        handler = new QAChannel('QA', handlerConfig);
        mockMessage = {
            author: { bot: false },
            channel: { 
                id: '123',
                sendTyping: jest.fn(),
                send: jest.fn()
            },
            content: 'hola',
            reply: jest.fn().mockResolvedValue({}),
        };
        mockState = {
            responses: [
                {
                    trigger: 'hola',
                    trigger_regex: /hola/i,
                    replies: [
                        { text_response: 'mundo', img_response: '' }
                    ]
                }
            ]
        };
    });

    it('should handle matching message in correct channel', async () => {
        await handler.handle(mockMessage, mockState);
        expect(mockMessage.reply).toHaveBeenCalledWith('mundo');
    });

    it('should process bot message if ignoreBots is false', async () => {
        handler.config.ignoreBots = false;
        mockMessage.author.bot = true;
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
    });
});

    