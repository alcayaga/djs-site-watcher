const Discord = require('discord.js');
const DealsChannel = require('../../src/channels/deals.js');

jest.mock('discord.js');
// Mock the solotodo utils
jest.mock('../../src/utils/solotodo', () => ({
    extractQuery: jest.fn(),
    searchSolotodo: jest.fn(),
    searchByUrl: jest.fn(),
    getProductUrl: jest.fn(),
    getSearchUrl: jest.fn(),
    getAvailableEntities: jest.fn(),
    getStores: jest.fn()
}));

const { extractQuery, searchSolotodo, searchByUrl, getProductUrl, getSearchUrl, getAvailableEntities, getStores } = require('../../src/utils/solotodo');

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
                displayName: 'testuser',
                send: jest.fn().mockResolvedValue({})
            },
            channel: { id: '456' },
            content: 'Great deal here: https://example.com',
            attachments: new Map(),
            delete: jest.fn().mockResolvedValue({}),
            startThread: jest.fn().mockResolvedValue(mockThread),
        };

        Discord.EmbedBuilder.mockClear();

        // Default mock implementations for URL helpers
        getProductUrl.mockImplementation(p => `https://www.solotodo.cl/products/${p.id}-${p.slug}`);
        getSearchUrl.mockImplementation(q => `https://www.solotodo.cl/search?search=${encodeURIComponent(q)}`);
        getAvailableEntities.mockResolvedValue([]);
        getStores.mockResolvedValue(new Map());
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
        expect(searchByUrl).toHaveBeenCalledWith('https://example.com/');
        expect(searchSolotodo).not.toHaveBeenCalled(); // Should skip text search
        expect(mockThread.send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.arrayContaining([expect.any(Object)])
        }));

        const embed = mockThread.send.mock.calls[0][0].embeds[0];
        expect(embed.data.url).toBe('https://www.solotodo.cl/products/111-direct-url-product');
    });

    it('should fetch and display top 3 cheapest sellers when a product is found', async () => {
        searchByUrl.mockResolvedValue({
            id: 111,
            name: 'Direct URL Product',
            slug: 'direct-url-product'
        });

        const mockEntities = [
            {
                store: 'https://api.com/stores/1/',
                external_url: 'https://store1.com/p',
                active_registry: {
                    is_available: true,
                    cell_monthly_payment: null,
                    normal_price: '100000.00',
                    offer_price: '90000.00'
                }
            },
            {
                store: 'https://api.com/stores/2/',
                external_url: 'https://store2.com/p',
                active_registry: {
                    is_available: true,
                    cell_monthly_payment: null,
                    normal_price: '110000.00',
                    offer_price: '110000.00'
                }
            },
            {
                store: 'https://api.com/stores/3/',
                external_url: 'https://store3.com/p',
                active_registry: {
                    is_available: true,
                    cell_monthly_payment: '5000.00', // Should be filtered out
                    normal_price: '50000.00',
                    offer_price: '40000.00'
                }
            },
            {
                store: 'https://api.com/stores/4/',
                external_url: 'https://store4.com/p',
                active_registry: {
                    is_available: true,
                    cell_monthly_payment: null,
                    normal_price: '120000.00',
                    offer_price: '95000.00'
                }
            },
            {
                store: 'https://api.com/stores/5/',
                external_url: 'https://store5.com/p',
                active_registry: {
                    is_available: true,
                    cell_monthly_payment: null,
                    normal_price: '130000.00',
                    offer_price: '105000.00'
                }
            }
        ];

        const mockStoreMap = new Map([
            ['https://api.com/stores/1/', 'Store 1'],
            ['https://api.com/stores/2/', 'Store 2'],
            ['https://api.com/stores/4/', 'Store 4'],
            ['https://api.com/stores/5/', 'Store 5']
        ]);

        getAvailableEntities.mockResolvedValue(mockEntities);
        getStores.mockResolvedValue(mockStoreMap);

        await handler.handle(mockMessage, {}, {});

        // Should display top 3 (Store 1: 90k, Store 4: 95k, Store 5: 105k)
        // Store 2: 110k is 4th. Store 3 is filtered.
        expect(mockThread.send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.arrayContaining([expect.any(Object)])
        }));

        const embed = mockThread.send.mock.calls[0][0].embeds[0];
        expect(embed.addFields).toHaveBeenCalledWith(expect.objectContaining({
            name: expect.stringContaining('Mejores precios actuales')
        }));

        const priceField = embed.addFields.mock.calls[0][0].value;
        expect(priceField).toContain('Store 1');
        expect(priceField).toContain('Store 4');
        expect(priceField).toContain('Store 5');
        expect(priceField).not.toContain('Store 2');
        expect(priceField).toContain('90.000');
        expect(priceField).toContain('95.000');
        expect(priceField).toContain('105.000');
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
        expect(mockThread.send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.arrayContaining([expect.any(Object)])
        }));

        const embed = mockThread.send.mock.calls[0][0].embeds[0];
        expect(embed.data.url).toBe('https://www.solotodo.cl/products/222-text-search-product');
    });

    it('should post a generic search link if both methods fail but query exists', async () => {
        searchByUrl.mockResolvedValue(null);
        extractQuery.mockReturnValue('unknown product');
        searchSolotodo.mockResolvedValue(null);

        const handled = await handler.handle(mockMessage, {}, {});
        
        expect(handled).toBe(false);
        expect(mockThread.send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.arrayContaining([expect.any(Object)])
        }));

        const embed = mockThread.send.mock.calls[0][0].embeds[0];
        expect(embed.data.url).toBe('https://www.solotodo.cl/search?search=unknown%20product');
    });

    it('should do nothing if everything fails (no URL match, no query extracted)', async () => {
        searchByUrl.mockResolvedValue(null);
        extractQuery.mockReturnValue(null);

        const handled = await handler.handle(mockMessage, {}, {});
        
        expect(handled).toBe(false);
        expect(mockThread.send).not.toHaveBeenCalled();
    });
});
