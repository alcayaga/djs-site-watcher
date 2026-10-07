const solotodo = require('../../src/utils/solotodo');

describe('Solotodo Entity Utils', () => {
    const REFURBISHED_URL = solotodo.REFURBISHED_CONDITION_URL;
    const NEW_URL = solotodo.NEW_CONDITION_URL;

    describe('filterValidEntities', () => {

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

        it('should filter out used, open box, damaged, and null condition entities', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: null }, condition: 'https://schema.org/UsedCondition' },
                { active_registry: { offer_price: "60", cell_monthly_payment: null }, condition: 'https://schema.org/OpenBoxCondition' },
                { active_registry: { offer_price: "70", cell_monthly_payment: null }, condition: 'https://schema.org/DamagedCondition' },
                { active_registry: { offer_price: "80", cell_monthly_payment: null }, condition: null },
                { active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }
            ];
            
            const valid = solotodo.filterValidEntities(entities);
            expect(valid).toHaveLength(1);
            expect(valid[0].condition).toBe(NEW_URL);
        });

        it('should filter out entities from banned refurbished stores (e.g. BackOnline, Reuse)', () => {
            const storeMap = new Map([
                [6101, { id: 6101, name: 'BackOnline' }],
                [260, { id: 260, name: 'Mercado Libre' }]
            ]);

            const entities = [
                { store: 6101, external_url: 'https://backonline.cl/products/ipad', active_registry: { offer_price: "399990", cell_monthly_payment: null }, condition: NEW_URL },
                { store: 2471, external_url: 'https://www.reuse.cl/products/iphone', active_registry: { offer_price: "299990", cell_monthly_payment: null }, condition: NEW_URL },
                { store: 'https://publicapi.solotodo.com/stores/6101/', external_url: 'https://backonline.cl/products/watch', active_registry: { offer_price: "199990", cell_monthly_payment: null }, condition: NEW_URL },
                { store: 260, external_url: 'https://www.mercadolibre.cl/p/123', active_registry: { offer_price: "777293", cell_monthly_payment: null }, condition: NEW_URL }
            ];

            const valid = solotodo.filterValidEntities(entities, storeMap);
            expect(valid).toHaveLength(1);
            expect(valid[0].store).toBe(260);
        });

        it('should filter out entities with refurbished keywords in external URL or product name', () => {
            const entities = [
                { name: 'iPhone 13 - Seminuevo', external_url: 'https://store.cl/product/1', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { name: 'iPad mini 6', external_url: 'https://store.cl/collections/semi-nuevos/products/ipad', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { name: 'MacBook Air M1 Reacondicionado', external_url: 'https://store.cl/product/2', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { name: 'Apple Watch Open Box', external_url: 'https://store.cl/product/3', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { name: 'iPad mini 6', external_url: 'https://falabella.com/product/123', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL }
            ];

            const valid = solotodo.filterValidEntities(entities);
            expect(valid).toHaveLength(1);
            expect(valid[0].external_url).toBe('https://falabella.com/product/123');
        });

        it('should filter out entities when store name in storeMap indicates refurbished', () => {
            const storeMap = new Map([
                [9999, { id: 9999, name: 'Tienda Reacondicionados Chile' }],
                [100, { id: 100, name: 'Falabella' }]
            ]);

            const entities = [
                { store: 9999, external_url: 'https://somestore.cl/item', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { store: 100, external_url: 'https://falabella.com/item', active_registry: { offer_price: "200", cell_monthly_payment: null }, condition: NEW_URL }
            ];

            const valid = solotodo.filterValidEntities(entities, storeMap);
            expect(valid).toHaveLength(1);
            expect(valid[0].store).toBe(100);
        });

        it('should filter out entities when store name in storeMap indicates CPO or refurbished', () => {
            const storeMap = new Map([
                [8888, { id: 8888, name: 'iStore CPO Chile' }],
                [100, { id: 100, name: 'Falabella' }]
            ]);

            const entities = [
                { store: 8888, external_url: 'https://somestore.cl/item', active_registry: { offer_price: "100", cell_monthly_payment: null }, condition: NEW_URL },
                { store: 100, external_url: 'https://falabella.com/item', active_registry: { offer_price: "200", cell_monthly_payment: null }, condition: NEW_URL }
            ];

            const valid = solotodo.filterValidEntities(entities, storeMap);
            expect(valid).toHaveLength(1);
            expect(valid[0].store).toBe(100);
        });

        it('should return empty list if all entities are filtered out', () => {
            const entities = [
                { active_registry: { offer_price: "50", cell_monthly_payment: "10000" }, condition: NEW_URL }, // Plan
                { active_registry: { offer_price: "40", cell_monthly_payment: null }, condition: REFURBISHED_URL } // Refurbished
            ];
            
            expect(solotodo.filterValidEntities(entities)).toEqual([]);
        });
    });

    describe('isValidEntity', () => {
        it('should return false for null or undefined entity', () => {
            expect(solotodo.isValidEntity(null)).toBe(false);
            expect(solotodo.isValidEntity(undefined)).toBe(false);
        });

        it('should return false for BackOnline entity matching production payload', () => {
            const prodBackOnlineEntity = {
                id: 1321588,
                name: 'iPad mini 6 WiFi - 64 GB / Gris Espacial',
                store: 6101,
                store_id: 6101,
                external_url: 'https://backonline.cl/products/ipad-mini-6-8-3-wifi',
                condition: 'https://schema.org/NewCondition',
                active_registry: {
                    normal_price: '399990.00',
                    offer_price: '399990.00',
                    cell_monthly_payment: null
                }
            };
            expect(solotodo.isValidEntity(prodBackOnlineEntity)).toBe(false);
        });

        it('should not falsely match words containing "cpo" as a substring (e.g. MacPower, MacPoint)', () => {
            const entity = {
                name: 'Cargador MacPower USB-C 65W',
                store: 260,
                external_url: 'https://mercadolibre.cl/macpower-charger',
                condition: NEW_URL,
                active_registry: { offer_price: '29990', normal_price: '29990', cell_monthly_payment: null }
            };
            expect(solotodo.isValidEntity(entity)).toBe(true);
        });

        it('should filter out entities explicitly labeled as CPO with word boundaries', () => {
            const entity = {
                name: 'Apple iPhone 12 64GB - CPO',
                store: 260,
                external_url: 'https://mercadolibre.cl/iphone-12-cpo',
                condition: NEW_URL,
                active_registry: { offer_price: '349990', normal_price: '349990', cell_monthly_payment: null }
            };
            expect(solotodo.isValidEntity(entity)).toBe(false);
        });

        it('should properly ban stores when storeObj.id is a string', () => {
            const storeMap = new Map([
                [6101, { id: '6101', name: 'BackOnline' }]
            ]);
            const entity = {
                store: 6101,
                condition: NEW_URL,
                active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
            };
            expect(solotodo.isValidEntity(entity, storeMap)).toBe(false);
        });

        it('should not reject entities when description contains generic terms like "usado" in usage instructions', () => {
            const entity = {
                name: 'Apple iPad 10th Gen',
                description: 'Este producto puede ser usado con el Apple Pencil de 1ra generación.',
                store: 260,
                condition: NEW_URL,
                active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
            };
            expect(solotodo.isValidEntity(entity)).toBe(true);
        });

        it('should reject entities when description contains unambiguous refurbished terms', () => {
            const entity = {
                name: 'Apple iPad 10th Gen',
                description: 'Equipo reacondicionado grado A con 3 meses de garantía.',
                store: 260,
                condition: NEW_URL,
                active_registry: { offer_price: '399990', normal_price: '399990', cell_monthly_payment: null }
            };
            expect(solotodo.isValidEntity(entity)).toBe(false);
        });

        it('should correctly match uppercase accented refurbished keywords with u flag', () => {
            const entity = {
                name: 'iPhone 13 128GB REACONDICIONADO GRADO A',
                store: 260,
                external_url: 'https://mercadolibre.cl/item',
                condition: NEW_URL,
                active_registry: { offer_price: '499990', normal_price: '499990', cell_monthly_payment: null }
            };
            expect(solotodo.isValidEntity(entity)).toBe(false);
            expect(solotodo.containsRefurbishedKeyword('REACONDICIONADO')).toBe(true);
            expect(solotodo.containsRefurbishedKeyword('SEMINUEVO')).toBe(true);
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

    describe('getEffectivePrice', () => {
        it('should return NaN if active_registry price is invalid', () => {
            expect(solotodo.getEffectivePrice({}, 'offer_price')).toBeNaN();
        });

        it('should return base price if no valid coupon exists', () => {
            const entity = { active_registry: { offer_price: '1000' } };
            expect(solotodo.getEffectivePrice(entity, 'offer_price')).toBe(1000);
        });

        it('should apply raw amount discount if coupon applies to both', () => {
            const entity = { 
                active_registry: { offer_price: '1000' },
                best_coupon: { code: 'TEST', amount: '200', amount_type: 1, price_type: 'both' }
            };
            expect(solotodo.getEffectivePrice(entity, 'offer_price')).toBe(800);
        });

        it('should apply percentage discount with max_discount', () => {
            const entity = { 
                active_registry: { offer_price: '1000' },
                best_coupon: { code: 'TEST', amount: '20', amount_type: 2, price_type: 'both', max_discount_amount: '150' }
            };
            // 20% of 1000 is 200, max is 150, so discount is 150
            expect(solotodo.getEffectivePrice(entity, 'offer_price')).toBe(850);
        });

        it('should apply percentage discount without max_discount', () => {
            const entity = { 
                active_registry: { offer_price: '1000' },
                best_coupon: { code: 'TEST', amount: '20', amount_type: 2, price_type: 'both', max_discount_amount: null }
            };
            expect(solotodo.getEffectivePrice(entity, 'offer_price')).toBe(800);
        });

        it('should not go below zero', () => {
            const entity = { 
                active_registry: { offer_price: '1000' },
                best_coupon: { code: 'TEST', amount: '2000', amount_type: 1, price_type: 'both' }
            };
            expect(solotodo.getEffectivePrice(entity, 'offer_price')).toBe(0);
        });
        
        it('should not apply coupon if price_type mismatch', () => {
            const entity = { 
                active_registry: { offer_price: '1000' },
                best_coupon: { code: 'TEST', amount: '200', amount_type: 1, price_type: 'normal' }
            };
            expect(solotodo.getEffectivePrice(entity, 'offer_price')).toBe(1000);
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

        it('should find best entity considering coupons', () => {
            const entities = [
                { active_registry: { offer_price: '2000' } },
                { active_registry: { offer_price: '1600' } },
                { 
                    active_registry: { offer_price: '1700' },
                    best_coupon: { code: 'TEST', amount: '200', amount_type: 1, price_type: 'both' }
                }
            ];
            const { minPrice, bestEntities } = solotodo.findBestEntities(entities, 'offer_price', MIN_SANITY_PRICE);
            expect(minPrice).toBe(1500);
            expect(bestEntities).toHaveLength(1);
            expect(bestEntities[0]).toBe(entities[2]); // The 1700 - 200 = 1500 one
        });

        it('should ignore entities with effective prices below sanity check', () => {
            const entities = [
                { active_registry: { offer_price: '1100' }, best_coupon: { code: 'TEST', amount: '500', amount_type: 1, price_type: 'both' } }, // Effective: 600 (Below sanity)
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

    describe('Refurbished Keywords Constants', () => {
        it('should derive UNAMBIGUOUS_REFURBISHED_KEYWORDS from REFURBISHED_KEYWORDS excluding ambiguous terms', () => {
            const constants = require('../../src/utils/constants');
            const ambiguousTerms = ['usado', 'usada', 'usados', 'usadas'];
            for (const term of ambiguousTerms) {
                expect(constants.REFURBISHED_KEYWORDS).toContain(term);
                expect(constants.UNAMBIGUOUS_REFURBISHED_KEYWORDS).not.toContain(term);
            }
            for (const kw of constants.UNAMBIGUOUS_REFURBISHED_KEYWORDS) {
                expect(constants.REFURBISHED_KEYWORDS).toContain(kw);
            }
        });
    });
});
