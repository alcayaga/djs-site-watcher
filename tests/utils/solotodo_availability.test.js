jest.mock('../../src/config', () => ({
    solotodoBaseUrl: 'https://www.solotodo.cl',
    solotodoApiUrl: 'https://publicapi.solotodo.com',
    ALLOW_PRIVATE_IPS: false,
    monitors: []
}));

const { searchSolotodo } = require('../../src/utils/solotodo');
const got = require('got');

jest.mock('got');

describe('Solotodo Utils - searchSolotodo Availability', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should prioritize in-stock products when searching', async () => {
        // 1. Mock search results
        got.mockResolvedValueOnce({
            body: {
                results: [
                    { id: 70846, name: 'Apple AirPods Pro (1st gen)', slug: 'airpods-1' },
                    { id: 224175, name: 'Apple AirPods Pro (2nd gen)', slug: 'airpods-2' }
                ]
            }
        });

        // 2. Mock availability check
        got.mockResolvedValueOnce({
            body: {
                results: [
                    {
                        product: { id: 70846 },
                        entities: [] // Out of stock
                    },
                    {
                        product: { id: 224175 },
                        entities: [
                            { 
                                active_registry: { is_available: true, offer_price: '199990', normal_price: '219990', cell_monthly_payment: null },
                                condition: 'https://schema.org/NewCondition'
                            }
                        ] // In stock
                    }
                ]
            }
        });

        const result = await searchSolotodo('AirPods Pro');
        
        expect(result.id).toBe(224175);
        expect(result.name).toBe('Apple AirPods Pro (2nd gen)');
        
        // Verify both IDs were checked for availability
        const availabilityCall = got.mock.calls[1];
        const url = availabilityCall[0];
        expect(url).toContain('ids=70846');
        expect(url).toContain('ids=224175');
    });

    it('should fallback to first match if all are out of stock', async () => {
        // 1. Mock search results
        got.mockResolvedValueOnce({
            body: {
                results: [
                    { id: 1, name: 'Apple Product A', slug: 'a' },
                    { id: 2, name: 'Apple Product B', slug: 'b' }
                ]
            }
        });

        // 2. Mock availability check (both empty)
        got.mockResolvedValueOnce({
            body: {
                results: [
                    { product: { id: 1 }, entities: [] },
                    { product: { id: 2 }, entities: [] }
                ]
            }
        });

        const result = await searchSolotodo('Apple Product');
        
        expect(result.id).toBe(1); // Fallback to first
    });
});
