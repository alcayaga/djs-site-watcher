const QAChannel = require('../../src/channels/QAChannel.js');

jest.mock('discord.js');

describe('QAChannel', () => {
    let handler;
    let mockMessage;
    let mockState;
    let handlerConfig;

    beforeEach(() => {
        handlerConfig = {
            channelId: '123',
            responseDelay: 0
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
            react: jest.fn().mockResolvedValue({}),
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

    it('should handle matching message in correct channel (text only)', async () => {
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.reply).toHaveBeenCalledWith({ content: 'mundo' });
    });

    it('should handle reactions and pick only one random if array', async () => {
        mockState.responses[0].replies[0].reactions = ['\u{1F44D}', '\u{2705}']; // 👍, ✅
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        // Should only react once per level
        expect(mockMessage.react).toHaveBeenCalledTimes(1);
        const calledEmoji = mockMessage.react.mock.calls[0][0];
        expect(['\u{1F44D}', '\u{2705}']).toContain(calledEmoji);
    });

    it('should handle reactions at response level and pick only one', async () => {
        mockState.responses[0].reactions = ['\u{1F525}', '\u{2728}']; // 🔥, ✨
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.react).toHaveBeenCalledTimes(1);
        const calledEmoji = mockMessage.react.mock.calls[0][0];
        expect(['\u{1F525}', '\u{2728}']).toContain(calledEmoji);
    });

    it('should not call sendTyping if there is no text or image response', async () => {
        mockState.responses[0].replies[0] = { reactions: '\u{1F44B}' }; // 👋
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.channel.sendTyping).not.toHaveBeenCalled();
        expect(mockMessage.reply).not.toHaveBeenCalled();
        expect(mockMessage.react).toHaveBeenCalledWith('\u{1F44B}');
    });

    it('should call sendTyping if there is text response', async () => {
        mockState.responses[0].replies[0] = { text_response: 'hola', reactions: '\u{1F44B}' }; // 👋
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.channel.sendTyping).toHaveBeenCalled();
        expect(mockMessage.reply).toHaveBeenCalled();
        expect(mockMessage.react).toHaveBeenCalledWith('\u{1F44B}');
    });

    it('should handle duplicate reactions gracefully', async () => {
        mockState.responses[0].reactions = ['\u{1F44D}']; // 👍
        mockState.responses[0].replies[0].reactions = ['\u{1F44D}', '\u{2705}']; // 👍, ✅
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        // We pick ONE from response (👍) and ONE from reply (either 👍 or ✅)
        // If it picks 👍 from reply, total is 1. If it picks ✅, total is 2.
        // The test was failing because of randomness!
        const callCount = mockMessage.react.mock.calls.length;
        expect([1, 2]).toContain(callCount);
        
        const calledEmojis = mockMessage.react.mock.calls.map(c => c[0]);
        if (callCount === 1) {
            expect(calledEmojis).toEqual(['\u{1F44D}']);
        } else {
            expect(calledEmojis).toContain('\u{1F44D}');
            expect(calledEmojis).toContain('\u{2705}');
        }
    });

    it('should handle custom Discord emojis by extracting ID', async () => {
        mockState.responses[0].replies[0] = { reactions: '<:custom:1234567890>' };
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.react).toHaveBeenCalledWith('1234567890');
    });

    it('should handle image responses', async () => {
        mockState.responses[0].replies[0] = { text_response: '', img_response: 'image.png' };
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
            files: expect.any(Array)
        }));
    });

    it('should handle combined text and image responses', async () => {
        mockState.responses[0].replies[0] = { text_response: 'mundo', img_response: 'image.png' };
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.reply).toHaveBeenCalledWith(expect.objectContaining({
            content: 'mundo',
            files: expect.any(Array)
        }));
    });

    it('should handle missing text_response key gracefully', async () => {
        mockState.responses[0].replies[0] = { img_response: 'image.png' };
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.reply).toHaveBeenCalledWith({
            files: [expect.any(Object)]
        });
        expect(mockMessage.reply.mock.calls[0][0]).not.toHaveProperty('content');
    });

    it('should handle missing img_response key gracefully', async () => {
        mockState.responses[0].replies[0] = { text_response: 'mundo' };
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
        expect(mockMessage.reply).toHaveBeenCalledWith({
            content: 'mundo'
        });
        expect(mockMessage.reply.mock.calls[0][0]).not.toHaveProperty('files');
    });

    it('should process bot message if ignoreBots is false', async () => {
        handler.config.ignoreBots = false;
        mockMessage.author.bot = true;
        const handled = await handler.handle(mockMessage, mockState);
        expect(handled).toBe(true);
    });
});