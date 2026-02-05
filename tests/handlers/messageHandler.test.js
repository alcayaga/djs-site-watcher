const { handleMessage } = require('../../src/handlers/messageHandler');
const channelManager = require('../../src/ChannelManager');

jest.mock('../../src/ChannelManager');

describe('messageHandler', () => {
    let mockMessage;
    let mockState;
    let mockConfig;

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
        mockConfig = {
            DISCORDJS_APCHANNEL_ID: '123',
            DISCORDJS_DEALS_CHANNEL_ID: '456',
            AP_RESPONSE_DELAY: 0
        };
        jest.clearAllMocks();
    });

    it('should call channelManager.handleMessage', async () => {
        await handleMessage(mockMessage, mockState, mockConfig);
        expect(channelManager.handleMessage).toHaveBeenCalledWith(mockMessage, mockState, mockConfig);
    });
});
