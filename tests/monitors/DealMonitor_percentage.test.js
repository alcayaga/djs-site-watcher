const DealMonitor = require('../../src/monitors/DealMonitor');
const got = require('got');
const solotodo = require('../../src/utils/solotodo');
const Discord = require('discord.js');
const logger = require('../../src/utils/logger');

jest.mock('got');
jest.mock('discord.js');
jest.mock('../../src/storage');
jest.mock('../../src/config');
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));
jest.mock('../../src/utils/helpers', () => ({
    sleep: jest.fn().mockResolvedValue()
}));
jest.mock('../../src/utils/solotodo', () => ({
    ...jest.requireActual('../../src/utils/solotodo'),
    getProductHistory: jest.fn().mockResolvedValue([]),
    getBestPictureUrl: jest.fn().mockImplementation(p => Promise.resolve(p.pictureUrl || p.picture_url)),
    getAvailableEntities: jest.fn().mockResolvedValue([
        { active_registry: { offer_price: "100000", normal_price: "100000", cell_monthly_payment: null }, store: "https://api.com/stores/1/", external_url: "https://store.com" }
    ]),
    getStores: jest.fn().mockResolvedValue(new Map([["https://api.com/stores/1/", "Store 1"]]))
}));

describe('DealMonitor Percentage Tolerance', () => {
    let monitor;
    let mockChannel;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get('mockDealsChannelId');
        mockChannel.send = jest.fn().mockResolvedValue({ startThread: jest.fn().mockResolvedValue({}) });
        
        const monitorConfig = {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json',
            priceTolerance: 1000, // 1000 CLP flat tolerance
            minDropPercentage: 5, // 5% minimum drop
            verboseLogging: true
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
                    specs: { brand_brand_unicode: 'Apple' }
                },
                metadata: {
                    prices_per_currency: [{
                        currency: solotodo.SOLOTODO_CLP_CURRENCY_URL,
                        offer_price: p.offerPrice.toString(),
                        normal_price: p.normalPrice.toString()
                    }]
                }
            }]
        }));
        return JSON.stringify({ results });
    };

    it('should NOT alert if price drops by less than minDropPercentage, even if absolute drop > tolerance', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone 17', 
                minOfferPrice: 1000000, lastOfferPrice: 1000000, 
                minNormalPrice: 1000000, lastNormalPrice: 1000000 
            }
        };

        // Decrease by 30.000 CLP (3% drop)
        // 30.000 > 1.000 (tolerance) but 3% < 5% (minDropPercentage)
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone 17', offerPrice: 970000, normalPrice: 1000000 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
        expect(monitor.state['1'].minOfferPrice).toBe(970000);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('NEW HISTORIC LOW'),
            'iPhone 17',
            expect.anything(),
            'Offer',
            expect.anything(),
            expect.anything(),
            false, // isSignificant should be false
            expect.anything(),
            expect.anything()
        );
    });

    it('should alert if price drops by at least minDropPercentage', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone 17', 
                minOfferPrice: 1000000, lastOfferPrice: 1000000, 
                minNormalPrice: 1000000, lastNormalPrice: 1000000 
            }
        };

        // Decrease by 60.000 CLP (6% drop)
        // 60.000 > 1.000 and 6% >= 5%
        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'iPhone 17', offerPrice: 940000, normalPrice: 1000000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        expect(monitor.state['1'].minOfferPrice).toBe(940000);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('NEW HISTORIC LOW'),
            'iPhone 17',
            expect.anything(),
            'Offer',
            expect.anything(),
            expect.anything(),
            true, // isSignificant should be true
            expect.anything(),
            expect.anything()
        );
    });

    it('should accumulate small drops and alert when the total drop reaches minDropPercentage', async () => {
        monitor.state = {
            '1': { 
                id: 1, name: 'iPhone 17', 
                minOfferPrice: 1000000, notifiedMinOfferPrice: 1000000, lastOfferPrice: 1000000, 
                minNormalPrice: 1000000, notifiedMinNormalPrice: 1000000, lastNormalPrice: 1000000 
            }
        };

        // Day 1: Decrease by 30.000 CLP (3% drop) -> No alert, but minOfferPrice updates
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone 17', offerPrice: 970000, normalPrice: 1000000 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
        expect(monitor.state['1'].minOfferPrice).toBe(970000);
        expect(monitor.state['1'].notifiedMinOfferPrice).toBe(1000000);

        // Day 2: Decrease by another 30.000 CLP to 940.000
        // Total drop from notified (1.000.000) is 60.000 (6%)
        got.mockResolvedValueOnce({
            body: mockApiResponse([{ id: 1, name: 'iPhone 17', offerPrice: 940000, normalPrice: 1000000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalledTimes(1);
        expect(monitor.state['1'].minOfferPrice).toBe(940000);
        expect(monitor.state['1'].notifiedMinOfferPrice).toBe(940000);
    });
});
