const { handleMessage } = require('../../src/handlers/messageHandler');
const channelManager = require('../../src/ChannelManager');

jest.mock('../../src/ChannelManager');

describe('messageHandler', () => {
    let mockMessage;
    let mockState;

    beforeEach(() => {
        mockMessage = {
            author: { bot: false },
            channel: { id: '123' },
            content: 'test message',
            attachments: new Map(),
            delete: jest.fn().mockResolvedValue({}),
            reply: jest.fn().mockResolvedValue({}),
        };
        mockState = { responses: [] };
        jest.clearAllMocks();
    });

    it('should call channelManager.handleMessage', async () => {
        await handleMessage(mockMessage, mockState);
        expect(channelManager.handleMessage).toHaveBeenCalledWith(mockMessage, mockState);
    });
});
