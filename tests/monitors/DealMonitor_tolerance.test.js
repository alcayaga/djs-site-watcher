const DealMonitor = require('../../src/monitors/DealMonitor');
const storage = require('../../src/storage');
const got = require('got');
const solotodo = require('../../src/utils/solotodo');
const Discord = require('discord.js');
const { DEFAULT_PRICE_TOLERANCE } = require('../../src/utils/constants');

jest.mock('got');
jest.mock('discord.js');
jest.mock('../../src/storage');
jest.mock('../../src/config');
jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));
jest.mock('../../src/utils/solotodo', () => ({
    ...jest.requireActual('../../src/utils/solotodo'),
    getProductHistory: jest.fn().mockResolvedValue([]),
    getAvailableEntities: jest.fn().mockResolvedValue([
        { active_registry: { offer_price: "119776", normal_price: "126080", cell_monthly_payment: null }, store: "https://api.com/stores/1/", external_url: "https://store.com" }
    ]),
    getStores: jest.fn().mockResolvedValue(new Map([["https://api.com/stores/1/", "Store 1"]])),
    getBestPictureUrl: jest.fn().mockResolvedValue('http://pic.jpg')
}));

describe('DealMonitor Tolerance', () => {
    let monitor;
    let mockChannel;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = new Discord.Client();
        // The mock Client in __mocks__/discord.js.js already has channels.cache.get mocking
        // We just need to ensure the mockChannel we use has the send method we want
        mockChannel = mockClient.channels.cache.get('mockDealsChannelId');
        mockChannel.send = jest.fn().mockResolvedValue({ startThread: jest.fn() });
        
        monitor = new DealMonitor('Deal', {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json'
        });
        monitor.client = mockClient;
    });

    const mockApiResponse = (products) => {
        const results = products.map(p => ({
            product_entries: [{
                product: { id: p.id, name: p.name, slug: 'slug', specs: { brand_unicode: 'Apple' } },
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

    it('should NOT alert for BACK_TO_LOW if decrease is within tolerance (Reproduction of reported issue)', async () => {
        // Report: $120.384 -> $119.776 (608 CLP decrease)
        // With 1000 tolerance, it SHOULD NOT alert.
        
        monitor.state = {
            '300332': { 
                id: 300332, name: 'MacBook Charger', 
                minOfferPrice: 119776, minOfferDate: '2025-01-01T00:00:00.000Z',
                lastOfferPrice: 120384, // Current price is slightly above min
                minNormalPrice: 126080, minNormalDate: '2025-01-01T00:00:00.000Z',
                lastNormalPrice: 126720 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 300332, name: 'MacBook Charger', offerPrice: 119776, normalPrice: 126080 }])
        });

        await monitor.check();

        // 120.384 - 119.776 = 608 < 1000. 
        // 120.384 <= 119.776 + 1000 is True.
        // wasAtMin = True. 
        // So it should NOT trigger BACK_TO_LOW.
        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should NOT alert for NEW_LOW if decrease is within tolerance', async () => {
        // Min: 120.000. New: 119.500. Decrease: 500.
        // 500 < 1000.
        // It should update state but NOT alert.

        monitor.state = {
            '1': { 
                id: 1, name: 'Product', 
                minOfferPrice: 120000, lastOfferPrice: 120000, 
                minNormalPrice: 130000, lastNormalPrice: 130000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'Product', offerPrice: 119500, normalPrice: 130000 }])
        });

        await monitor.check();

        expect(mockChannel.send).not.toHaveBeenCalled();
        expect(monitor.state['1'].minOfferPrice).toBe(119500);
    });

    it('should alert for NEW_LOW if decrease IS significant', async () => {
        // Min: 120.000. New: 118.500. Decrease: 1500.
        // 1500 >= 1000.
        // It should alert.

        monitor.state = {
            '1': { 
                id: 1, name: 'Product', 
                minOfferPrice: 120000, lastOfferPrice: 120000, 
                minNormalPrice: 130000, lastNormalPrice: 130000 
            }
        };

        got.mockResolvedValue({
            body: mockApiResponse([{ id: 1, name: 'Product', offerPrice: 118500, normalPrice: 130000 }])
        });

        await monitor.check();

        expect(mockChannel.send).toHaveBeenCalled();
        expect(monitor.state['1'].minOfferPrice).toBe(118500);
    });
});
