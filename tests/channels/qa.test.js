const QAChannel = require('../../src/channels/qa.js');

describe('QAChannel', () => {
    let handler;
    let mockMessage;
    let mockState;
    let mockConfig;
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
        mockConfig = {
            AP_RESPONSE_DELAY: 0
        };
    });

    it('should handle matching message in correct channel', async () => {
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        expect(handled).toBe(true);
        expect(mockMessage.reply).toHaveBeenCalledWith('mundo');
    });

        it('should ignore message in wrong channel', async () => {

            handler.config.channelId = 'other';

            const handled = await handler.handle(mockMessage, mockState, mockConfig);

            expect(handled).toBe(false);

        });

    

        it('should process bot message if ignoreBots is false', async () => {

            handler.config.ignoreBots = false;

            mockMessage.author.bot = true;

            const handled = await handler.handle(mockMessage, mockState, mockConfig);

            expect(handled).toBe(true);

        });

    });

    