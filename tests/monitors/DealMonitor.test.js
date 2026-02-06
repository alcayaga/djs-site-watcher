const DealMonitor = require('../../src/monitors/DealMonitor');
const storage = require('../../src/storage');
const got = require('got');

jest.mock('../../src/storage');
jest.mock('../../src/config', () => ({
    interval: 1,
    monitors: [],
    DISCORDJS_DEALS_CHANNEL_ID: '789',
    SINGLE_RUN: 'false'
}));
jest.mock('got');

describe('DealMonitor', () => {
    let monitor;
    let mockChannel;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockChannel = {
            send: jest.fn().mockResolvedValue({})
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
                        offer_price: p.price.toString(),
                        normal_price: (p.price + 10000).toString()
                    }]
                }
            }]
        }));
        return JSON.stringify({ results });
    };

    it('should initialize and load state', async () => {
        storage.read.mockResolvedValue({ '1': { minPrice: 100, lastPrice: 100 } });
        await monitor.initialize(mockClient);
        expect(monitor.state['1'].minPrice).toBe(100);
    });

    it('should detect a new historic low and alert', async () => {
        monitor.state = {
            '1': { id: 1, name: 'iPhone', minPrice: 500000, lastPrice: 500000 }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', price: 450000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.setTitle).toHaveBeenCalledWith(expect.stringContaining('Nuevo mínimo histórico'));
        
        expect(monitor.state['1'].minPrice).toBe(450000);
    });

    it('should detect return to historic low and alert', async () => {
        // Price was 100 (min), then went to 150 (last), now back to 100
        monitor.state = {
            '1': { id: 1, name: 'iPhone', minPrice: 100, lastPrice: 150 }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', price: 100 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        expect(embed.setTitle).toHaveBeenCalledWith(expect.stringContaining('De nuevo a precio mínimo'));

        expect(monitor.state['1'].lastPrice).toBe(100);
    });

    it('should NOT alert if price stays at historic low', async () => {
        monitor.state = {
            '1': { id: 1, name: 'iPhone', minPrice: 100, lastPrice: 100 }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', price: 100 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should NOT alert if price increases', async () => {
        monitor.state = {
            '1': { id: 1, name: 'iPhone', minPrice: 100, lastPrice: 100 }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone', price: 150 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
        expect(monitor.state['1'].lastPrice).toBe(150);
        expect(monitor.state['1'].minPrice).toBe(100);
    });

    it('should filter out non-Apple brands', async () => {
        monitor.state = {};

        got.mockResolvedValue({
            body: mockApiResponse([
                { id: 1, name: 'iPhone', price: 100, brand: 'Apple' },
                { id: 2, name: 'Galaxy', price: 100, brand: 'Samsung' }
            ])
        });

        await monitor.check();

        expect(monitor.state['1']).toBeDefined();
        expect(monitor.state['2']).toBeUndefined();
    });
});
