const DealsChannel = require('../../src/channels/deals.js');

// Mock the solotodo utils
jest.mock('../../src/utils/solotodo', () => ({
    extractQuery: jest.fn(),
    searchSolotodo: jest.fn(),
    searchByUrl: jest.fn(),
    getProductUrl: jest.fn(),
    getSearchUrl: jest.fn()
}));

const { extractQuery, searchSolotodo, searchByUrl, getProductUrl, getSearchUrl } = require('../../src/utils/solotodo');

describe('DealsChannel Solotodo Integration', () => {
    let handler;
    let mockMessage;
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

        // Default mock implementations for URL helpers
        getProductUrl.mockImplementation(p => `https://www.solotodo.cl/products/${p.id}-${p.slug}`);
        getSearchUrl.mockImplementation(q => `https://www.solotodo.cl/search?search=${encodeURIComponent(q)}`);
    });

    it('should use searchByUrl first and prioritize it over text search', async () => {
        // Setup: URL returns a product directly
        searchByUrl.mockResolvedValue({
            id: 111,
            name: 'Direct URL Product',
            slug: 'direct-url-product'
        });
        // extractQuery might still return something, but it shouldn't matter if URL works
        extractQuery.mockReturnValue('iphone 15'); 

        const handled = await handler.handle(mockMessage, {}, {});
        
        expect(handled).toBe(false);
        expect(searchByUrl).toHaveBeenCalledWith('https://example.com');
        expect(searchSolotodo).not.toHaveBeenCalled(); // Should skip text search
        expect(mockThread.send).toHaveBeenCalledWith(
            expect.stringContaining('https://www.solotodo.cl/products/111-direct-url-product')
        );
    });

    it('should fallback to text search if searchByUrl returns null', async () => {
        // Setup: URL lookup fails (not tracked)
        searchByUrl.mockResolvedValue(null);
        
        // Text search succeeds
        extractQuery.mockReturnValue('iphone 15');
        searchSolotodo.mockResolvedValue({
            id: 222,
            name: 'Text Search Product',
            slug: 'text-search-product'
        });

        const handled = await handler.handle(mockMessage, {}, {});
        
        expect(handled).toBe(false);
        expect(searchByUrl).toHaveBeenCalled();
        expect(extractQuery).toHaveBeenCalled();
        expect(searchSolotodo).toHaveBeenCalledWith('iphone 15');
        expect(mockThread.send).toHaveBeenCalledWith(
            expect.stringContaining('https://www.solotodo.cl/products/222-text-search-product')
        );
    });

    it('should post a generic search link if both methods fail but query exists', async () => {
        searchByUrl.mockResolvedValue(null);
        extractQuery.mockReturnValue('unknown product');
        searchSolotodo.mockResolvedValue(null);

        const handled = await handler.handle(mockMessage, {}, {});
        
        expect(handled).toBe(false);
        expect(mockThread.send).toHaveBeenCalledWith(
            expect.stringContaining('https://www.solotodo.cl/search?search=unknown%20product')
        );
    });

    it('should do nothing if everything fails (no URL match, no query extracted)', async () => {
        searchByUrl.mockResolvedValue(null);
        extractQuery.mockReturnValue(null);

        const handled = await handler.handle(mockMessage, {}, {});
        
        expect(handled).toBe(false);
        expect(mockThread.send).not.toHaveBeenCalled();
    });
});
