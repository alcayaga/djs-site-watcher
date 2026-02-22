const DealMonitor = require('../../src/monitors/DealMonitor');
const Discord = require('discord.js');
const solotodo = require('../../src/utils/solotodo');

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
    getBestPictureUrl: jest.fn().mockResolvedValue('http://pic.jpg'),
    getAvailableEntities: jest.fn(),
    getStores: jest.fn()
}));
jest.mock('../../src/utils/helpers', () => ({
    sleep: jest.fn().mockResolvedValue()
}));

describe('DealMonitor - Store Truncation', () => {
    let monitor;
    let mockChannel;
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get('mockDealsChannelId');
        mockChannel.send.mockResolvedValue({ startThread: jest.fn() });
        
        const monitorConfig = {
            name: 'Deal',
            url: 'https://api.com/deals',
            file: './config/deals.json'
        };

        monitor = new DealMonitor('Deal', monitorConfig);
        monitor.client = mockClient;

        solotodo.getStores.mockResolvedValue(new Map([
            ["https://api.com/stores/1/", "Store A"],
        ]));
    });

    it('should truncate list of stores if it exceeds limit', async () => {
        const product = { id: 1, name: 'iPhone', offerPrice: 100000, normalPrice: 110000 };
        // Create enough entities to exceed 1000 chars
        // Each line is roughly: • **Store A**: [Ir a la tienda ↗](https://store-a.com/prod/1)
        // Approx 70 chars. 20 entities should do it.
        const entities = Array.from({ length: 20 }, (_, i) => ({
            active_registry: { offer_price: "100000", normal_price: "110000", cell_monthly_payment: null },
            store: "https://api.com/stores/1/",
            external_url: `https://store-a.com/prod/${i}`
        }));

        solotodo.getAvailableEntities.mockResolvedValue(entities);

        await monitor.notify({ product, triggers: ['NEW_LOW_OFFER'], date: new Date().toISOString() });

        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        const embed = sendCall.embeds[0];
        
        const vendorField = embed.data.fields.find(f => f.name.includes('Disponible en'));
        expect(vendorField).toBeDefined();
        
        // Check if value length is within safe limit
        expect(vendorField.value.length).toBeLessThanOrEqual(1024);
        // Check for truncation indicator
        expect(vendorField.value).toContain('... y');
    });
});
