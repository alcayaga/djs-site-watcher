const DealMonitor = require('../../src/monitors/DealMonitor');
const storage = require('../../src/storage');
const got = require('got');
const solotodo = require('../../src/utils/solotodo');
const { ThreadAutoArchiveDuration } = require('discord.js');

jest.mock('../../src/storage');
jest.mock('../../src/config', () => ({
    interval: 1,
    monitors: [],
    DISCORDJS_DEALS_CHANNEL_ID: '789',
    SINGLE_RUN: 'false'
}));
jest.mock('got');
jest.mock('../../src/utils/solotodo', () => ({
    ...jest.requireActual('../../src/utils/solotodo'),
    getProductHistory: jest.fn().mockResolvedValue([]),
    getBestPictureUrl: jest.fn().mockImplementation(p => Promise.resolve(p.pictureUrl || p.picture_url))
}));

describe('DealMonitor', () => {
    let monitor;
    let mockChannel;
    let mockClient;
    let mockMessage;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockMessage = {
            startThread: jest.fn().mockResolvedValue({})
        };

        mockChannel = {
            send: jest.fn().mockResolvedValue(mockMessage)
        };

        mockClient = {
            channels: {
                cache: {
                    get: jest.fn().mockReturnValue(mockChannel)
                }
            }
        };

        const monitorConfig = {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json'
        };

        monitor = new DealMonitor('Deal', monitorConfig);
        monitor.client = mockClient;
    });

    const mockApiResponse = (products) => {
        const results = products.map(p => ({
            product_entries: [{
                product: {
                    id: p.id,
                    name: p.name,
                    slug: p.slug || 'slug',
                    picture_url: p.picture_url || 'pic.jpg',
                    specs: {
                        brand_brand_unicode: p.brand || 'Apple'
                    }
                },
                metadata: {
                    prices_per_currency: [{
                        offer_price: p.offerPrice.toString(),
                        normal_price: p.normalPrice.toString()
                    }]
                }
            }]
        }));
        return JSON.stringify({ results });
    };

    it('should initialize and load state', async () => {
        storage.read.mockResolvedValue({ '1': { minOfferPrice: 100, lastOfferPrice: 100 } });
        await monitor.initialize(mockClient);
        expect(monitor.state['1'].minOfferPrice).toBe(100);
    });

    it('should detect a new historic low for offer price and alert', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 500000, 
                minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 600000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 450000, normalPrice: 600000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        expect(mockMessage.startThread).toHaveBeenCalledWith({
            name: 'iPhone',
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek
        });
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('Nuevo mínimo histórico (Precio Tarjeta)');
        
        expect(monitor.state['1'].minOfferPrice).toBe(450000);
        expect(monitor.state['1'].minOfferDate).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('should truncate long product names for thread titles at word boundary', async () => {
        const longName = 'This is a very long product name that will definitely exceed the one hundred characters limit to test truncation logic correctly';
        // length is ~130
        
        const product = {
            id: 1,
            name: longName,
            offerPrice: 100,
            normalPrice: 200
        };

        await monitor.notify({ product, type: 'NEW_LOW_OFFER' });

        expect(mockMessage.startThread).toHaveBeenCalled();
        const threadCall = mockMessage.startThread.mock.calls[0][0];
        
        // "This is a very long product name that will definitely exceed the one hundred characters limit to" is 96 chars
        // The word "test" starts at index 97.
        // lastSpaceIndex before 100 is at 96.
        expect(threadCall.name).toBe('This is a very long product name that will definitely exceed the one hundred characters limit to...');
        expect(threadCall.name.length).toBeLessThanOrEqual(100);
    });

    it('should detect a new historic low for normal price and alert', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 500000, 
                minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 600000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 500000, normalPrice: 550000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('Nuevo mínimo histórico (Cualquier medio)');
        
        expect(monitor.state['1'].minNormalPrice).toBe(550000);
        expect(monitor.state['1'].minNormalDate).not.toBe('2025-01-01T00:00:00.000Z');
    });

    it('should backfill history for new products with dates', async () => {
        monitor.state = {};
        solotodo.getProductHistory.mockResolvedValue([
            {
                pricing_history: [
                    { is_available: true, offer_price: "400000", normal_price: "410000", timestamp: "2024-12-01T10:00:00Z" },
                    { is_available: true, offer_price: "450000", normal_price: "460000", timestamp: "2024-12-02T10:00:00Z" }
                ]
            }
        ]);

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 500000, normalPrice: 510000 }])
        });

        await monitor.check();

        expect(solotodo.getProductHistory).toHaveBeenCalledWith('1');
        expect(monitor.state['1'].minOfferPrice).toBe(400000);
        expect(monitor.state['1'].minOfferDate).toBe("2024-12-01T10:00:00Z");
        expect(monitor.state['1'].minNormalPrice).toBe(410000);
        expect(monitor.state['1'].minNormalDate).toBe("2024-12-01T10:00:00Z");
    });

    it('should detect return to historic low and show previous date', async () => {
        const oldDate = '2024-12-01T10:00:00Z';
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 100, minOfferDate: oldDate,
                lastOfferPrice: 150, 
                minNormalPrice: 200, minNormalDate: oldDate,
                lastNormalPrice: 250 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100, normalPrice: 250 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('De nuevo a precio mínimo (Precio Tarjeta)');
        
        const dateField = embed.data.fields.find(f => f.name === '🕒 Visto por última vez');
        expect(dateField).toBeDefined();
        expect(dateField.value).toContain('1733047200'); // Unix for 2024-12-01T10:00:00Z

        expect(monitor.state['1'].lastOfferPrice).toBe(100);
    });

    it('should NOT alert if price stays at historic low', async () => {
        monitor.state = {
            '1': { id: 1, name: 'iPhone', minOfferPrice: 100, lastOfferPrice: 100, minNormalPrice: 200, lastNormalPrice: 200 }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 100, normalPrice: 200 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should filter out non-Apple brands', async () => {
        monitor.state = {};

        got.mockResolvedValue({
            body: mockApiResponse([
                { id: 1, name: 'iPhone', offerPrice: 100, normalPrice: 110, brand: 'Apple' },
                { id: 2, name: 'Galaxy', offerPrice: 100, normalPrice: 110, brand: 'Samsung' }
            ])
        });

        await monitor.check();

        expect(monitor.state['1']).toBeDefined();
        expect(monitor.state['2']).toBeUndefined();
    });

    it('should show only one alert if both prices reach new low', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone', 
                minOfferPrice: 500000, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 500000, 
                minNormalPrice: 600000, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 600000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', offerPrice: 450000, normalPrice: 550000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalledTimes(1);
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.data.title).toContain('¡Nuevos mínimos históricos!');
    });

    it('should support multiple URLs and combine results', async () => {
        monitor.config.url = ['https://api1.com', 'https://api2.com'];
        
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone 1', offerPrice: 100, normalPrice: 110 }])
        }).mockResolvedValueOnce({
            body: mockApiResponse([{ id: 2, name: 'iPhone 2', offerPrice: 200, normalPrice: 210 }])
        });

        await monitor.check();

        expect(got).toHaveBeenCalledTimes(2);
        expect(got.mock.calls[0][0]).toContain('exclude_refurbished=true');
        expect(monitor.state['1']).toBeDefined();
        expect(monitor.state['2']).toBeDefined();
    }, 15000);
});
