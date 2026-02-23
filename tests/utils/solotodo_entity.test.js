const solotodo = require('../../src/utils/solotodo');

describe('Solotodo Entity Utils', () => {
    describe('filterValidEntities', () => {
        const REFURBISHED_URL = solotodo.REFURBISHED_CONDITION_URL;
        const NEW_URL = solotodo.NEW_CONDITION_URL;

        it('should return empty list if input is empty or null', () => {
            expect(solotodo.filterValidEntities([])).toEqual([]);
            expect(solotodo.filterValidEntities(null)).toEqual([]);
        });

        it('should return all valid entities', () => {
            const entities = [
                { active_registry: { offer_price: "200", cell_monthly_payment: null }, condition: NEW_URL },
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const valid = solotodo.filterValidEntities(entities);
            expect(valid).toHaveLength(2);
            expect(valid).toContain(entities[0]);
            expect(valid).toContain(entities[1]);
        });

        it('should filter out entities with mobile plans (cell_monthly_payment not null)', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: "10000" }, condition: NEW_URL }, // Plan
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }     // No Plan
            ];
            
            const valid = solotodo.filterValidEntities(entities);
            expect(valid).toHaveLength(1);
            expect(valid[0]).toBe(entities[1]);
        });

        it('should filter out refurbished entities', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: null }, condition: REFURBISHED_URL },
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const valid = solotodo.filterValidEntities(entities);
            expect(valid).toHaveLength(1);
            expect(valid[0]).toBe(entities[1]);
        });

        it('should return empty list if all entities are filtered out', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: "10000" }, condition: NEW_URL }, // Plan
                { active_registry: { offer_price: "40", cell_monthly_payment: null }, condition: REFURBISHED_URL } // Refurbished
            ];
            
            expect(solotodo.filterValidEntities(entities)).toEqual([]);
        });
    });

    describe('determinePriceKey', () => {
        it('should return "offer_price" if triggers contain "OFFER"', () => {
            expect(solotodo.determinePriceKey(['NEW_LOW_OFFER'])).toBe('offer_price');
            expect(solotodo.determinePriceKey(['BACK_TO_LOW_OFFER'])).toBe('offer_price');
            expect(solotodo.determinePriceKey(['NEW_LOW_OFFER', 'NEW_LOW_NORMAL'])).toBe('offer_price');
        });

        it('should return "normal_price" if triggers do not contain "OFFER"', () => {
            expect(solotodo.determinePriceKey(['NEW_LOW_NORMAL'])).toBe('normal_price');
            expect(solotodo.determinePriceKey(['BACK_TO_LOW_NORMAL'])).toBe('normal_price');
            expect(solotodo.determinePriceKey([])).toBe('normal_price');
            expect(solotodo.determinePriceKey(null)).toBe('normal_price');
        });
    });

    describe('findBestEntities', () => {
        const MIN_SANITY_PRICE = 1000;

        it('should return default values if input is invalid', () => {
            const { minPrice, bestEntities } = solotodo.findBestEntities(null, 'offer_price', MIN_SANITY_PRICE);
            expect(minPrice).toBe(Infinity);
            expect(bestEntities).toEqual([]);
        });

        it('should find multiple entities with the same best price', () => {
            const entities = [
                { active_registry: { offer_price: '2000' } },
                { active_registry: { offer_price: '1500' } }, // Best
                { active_registry: { offer_price: '1500' } }, // Also best
            ];
            const { minPrice, bestEntities } = solotodo.findBestEntities(entities, 'offer_price', MIN_SANITY_PRICE);
            expect(minPrice).toBe(1500);
            expect(bestEntities).toHaveLength(2);
            expect(bestEntities).toContain(entities[1]);
            expect(bestEntities).toContain(entities[2]);
        });

        it('should ignore entities with prices below sanity check', () => {
            const entities = [
                { active_registry: { offer_price: '500' } }, // Below sanity
                { active_registry: { offer_price: '1500' } }, // Best valid
            ];
            const { minPrice, bestEntities } = solotodo.findBestEntities(entities, 'offer_price', MIN_SANITY_PRICE);
            expect(minPrice).toBe(1500);
            expect(bestEntities).toHaveLength(1);
            expect(bestEntities[0]).toBe(entities[1]);
        });

        it('should handle single best entity', () => {
            const entities = [
                { active_registry: { offer_price: '2000' } },
                { active_registry: { offer_price: '1000' } }, // Best
                { active_registry: { offer_price: '3000' } }
            ];
            const { minPrice, bestEntities } = solotodo.findBestEntities(entities, 'offer_price', MIN_SANITY_PRICE);
            expect(minPrice).toBe(1000);
            expect(bestEntities).toHaveLength(1);
            expect(bestEntities[0]).toBe(entities[1]);
        });

        it('should return empty list if no entities meet sanity price', () => {
            const entities = [
                { active_registry: { offer_price: '500' } },
                { active_registry: { offer_price: '100' } }
            ];
            const { minPrice, bestEntities } = solotodo.findBestEntities(entities, 'offer_price', MIN_SANITY_PRICE);
            expect(minPrice).toBe(Infinity);
            expect(bestEntities).toEqual([]);
        });
    });
});
