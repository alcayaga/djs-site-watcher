const DealsChannel = require('../../src/channels/deals.js');

// Mock the solotodo utils
jest.mock('../../src/utils/solotodo', () => {
    const originalModule = jest.requireActual('../../src/utils/solotodo');
    return {
        ...originalModule, // Keep extractQuery real for this test? No, let's keep mocking it for the integration test but test it separately if needed.
        // Actually, to test the new extraction logic, we should probably unit test `src/utils/solotodo.js` directly or use the real one here.
        // Let's stick to the previous pattern of mocking for the DealsChannel test, but add a new test specifically for the utils.
        extractQuery: jest.fn(),
        searchSolotodo: jest.fn()
    };
});

const { extractQuery, searchSolotodo } = require('../../src/utils/solotodo');

describe('DealsChannel Solotodo Integration', () => {
    let handler;
    let mockMessage;
    let mockState;
    let mockConfig;
    let mockThread;
    let handlerConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        
        handlerConfig = {
            channelId: '456'
        };
        handler = new DealsChannel('Deals', handlerConfig);
        
        mockThread = {
            send: jest.fn().mockResolvedValue({})
        };

        mockMessage = {
            author: { 
                bot: false,
                username: 'testuser',
                send: jest.fn().mockResolvedValue({})
            },
            channel: { id: '456' },
            content: 'Great deal here: https://example.com',
            attachments: new Map(),
            delete: jest.fn().mockResolvedValue({}),
            startThread: jest.fn().mockResolvedValue(mockThread),
        };
        mockState = {};
        mockConfig = {};
    });

    it('should post a Solotodo product link when product is found', async () => {
        extractQuery.mockReturnValue('iphone 15');
        searchSolotodo.mockResolvedValue({
            id: 12345,
            name: 'iPhone 15',
            slug: 'iphone-15'
        });

        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        
        expect(handled).toBe(false);
        expect(mockMessage.startThread).toHaveBeenCalled();
        expect(extractQuery).toHaveBeenCalledWith(mockMessage.content);
        expect(searchSolotodo).toHaveBeenCalledWith('iphone 15');
        expect(mockThread.send).toHaveBeenCalledWith(
            expect.stringContaining('https://www.solotodo.cl/products/12345-iphone-15')
        );
    });

    it('should post a search link when product is not found', async () => {
        extractQuery.mockReturnValue('unknown product');
        searchSolotodo.mockResolvedValue(null);

        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        
        expect(handled).toBe(false);
        expect(mockThread.send).toHaveBeenCalledWith(
            expect.stringContaining('https://www.solotodo.cl/search?search=unknown%20product')
        );
    });

    it('should do nothing if extractQuery returns null', async () => {
        extractQuery.mockReturnValue(null);

        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        
        expect(handled).toBe(false);
        expect(searchSolotodo).not.toHaveBeenCalled();
        expect(mockThread.send).not.toHaveBeenCalled();
    });

    it('should gracefully handle errors in Solotodo logic', async () => {
        extractQuery.mockReturnValue('iphone');
        searchSolotodo.mockRejectedValue(new Error('API Error'));

        // Should not throw
        const handled = await handler.handle(mockMessage, mockState, mockConfig);
        
        expect(handled).toBe(false);
        expect(mockThread.send).not.toHaveBeenCalled();
    });
});
