const solotodo = require('../../src/utils/solotodo');

describe('Solotodo Entity Selection', () => {
    describe('findBestEntity', () => {
        const REFURBISHED_URL = solotodo.REFURBISHED_CONDITION_URL;
        const NEW_URL = 'https://schema.org/NewCondition';

        it('should return null if entities list is empty or null', () => {
            expect(solotodo.findBestEntity([])).toBeNull();
            expect(solotodo.findBestEntity(null)).toBeNull();
        });

        it('should find the cheapest offer price among valid entities', () => {
            const entities = [
                { active_registry: { offer_price: "200", cell_monthly_payment: null }, condition: NEW_URL },
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { active_registry: { offer_price: "300", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const best = solotodo.findBestEntity(entities, ['NEW_LOW_OFFER']);
            expect(best).toBe(entities[1]); // The one with price 100
        });

        it('should find the cheapest normal price when triggers involve NORMAL price', () => {
             const entities = [
                { active_registry: { normal_price: "200", offer_price: "150", cell_monthly_payment: null }, condition: NEW_URL },
                { active_registry: { normal_price: "100", offer_price: "90", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const best = solotodo.findBestEntity(entities, ['NEW_LOW_NORMAL']);
            expect(best).toBe(entities[1]); // The one with normal price 100
        });

        it('should default to normal price if no OFFER trigger is present', () => {
            const entities = [
                { active_registry: { normal_price: "200", offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { active_registry: { normal_price: "150", offer_price: "120", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            // No specific trigger passed
            const best = solotodo.findBestEntity(entities, []);
            expect(best).toBe(entities[1]); // Should pick based on normal price (150 < 200)
        });

        it('should ignore entities with mobile plans (cell_monthly_payment not null)', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: "10000" }, condition: NEW_URL }, // Plan
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }     // No Plan
            ];
            
            const best = solotodo.findBestEntity(entities, ['NEW_LOW_OFFER']);
            expect(best).toBe(entities[1]); // Should ignore the plan one even if cheaper upfront
        });

        it('should ignore refurbished entities', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: null }, condition: REFURBISHED_URL },
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const best = solotodo.findBestEntity(entities, ['NEW_LOW_OFFER']);
            expect(best).toBe(entities[1]); // Should ignore refurbished
        });

        it('should return null if all entities are filtered out', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: "10000" }, condition: NEW_URL }, // Plan
                { active_registry: { offer_price: "40", cell_monthly_payment: null }, condition: REFURBISHED_URL } // Refurbished
            ];
            
            expect(solotodo.findBestEntity(entities, ['NEW_LOW_OFFER'])).toBeNull();
        });

        it('should handle missing active_registry gracefully', () => {
            const entities = [
                { condition: NEW_URL }, // Missing active_registry
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const best = solotodo.findBestEntity(entities, ['NEW_LOW_OFFER']);
            expect(best).toBe(entities[1]);
        });
    });
});
