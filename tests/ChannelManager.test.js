const channelManager = require('../src/ChannelManager');
const path = require('path');

// Mock config
jest.mock('../src/config', () => ({
    channels: [
        {
            name: 'TestChannel',
            handler: 'Test', // We will mock this
            enabled: true,
            channelId: '123'
        },
        {
            name: 'DisabledChannel',
            handler: 'Test',
            enabled: false,
            channelId: '456'
        }
    ]
}));

// Mock fs to load our test handler
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        readdirSync: jest.fn().mockReturnValue(['test.js']),
        existsSync: jest.fn().mockReturnValue(true),
        promises: {
            readdir: jest.fn().mockResolvedValue(['test.js']),
        },
    };
});

describe('ChannelManager', () => {
    let mockHandlerClass;
    let mockHandlerInstance;

    beforeEach(() => {
        // Reset handlers map
        channelManager.handlers = new Map();
        
        // Mock the handler class and instance
        mockHandlerInstance = {
            initialize: jest.fn(),
            handle: jest.fn().mockResolvedValue(true)
        };
        mockHandlerClass = jest.fn().mockImplementation(() => mockHandlerInstance);
        
        // Mock require to return our mock class
        jest.mock(path.join(__dirname, '../src/channels/test.js'), () => mockHandlerClass, { virtual: true });
    });

    afterEach(() => {
        jest.resetModules();
    });

    // Note: Testing the initialize method fully with mocks is tricky due to require().
    // We will rely on the integration/system check for initialization and focus on routing here.
    
    it('should route message to correct handler', async () => {
        // Manually populate handlers for this test to avoid complex require mocking
        channelManager.handlers.set('123', [mockHandlerInstance]);
        
        const mockMessage = { channel: { id: '123' } };
        await channelManager.handleMessage(mockMessage, {}, {});
        
        expect(mockHandlerInstance.handle).toHaveBeenCalled();
    });

    it('should not route message if no handler for channel', async () => {
        channelManager.handlers.set('123', [mockHandlerInstance]);
        
        const mockMessage = { channel: { id: '999' } };
        await channelManager.handleMessage(mockMessage, {}, {});
        
        expect(mockHandlerInstance.handle).not.toHaveBeenCalled();
    });
});
