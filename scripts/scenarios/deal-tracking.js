/**
 * Simulation scenario for testing DealMonitor link engagement tracking.
 * This scenario configures trackingBaseUrl and trackingPort to verify
 * that generated Discord embeds include tracked redirect links.
 */
module.exports = {
    // Monitor configuration overrides for tracking
    monitorConfig: {
        trackingBaseUrl: 'http://localhost:3000',
        trackingPort: 3000,
        trustProxy: true,
        trustedHeader: 'cf-connecting-ip'
    },

    mockStores: new Map([
        ['https://api.com/stores/1/', { name: 'Falabella', preferred_payment_method: 'Tarjeta CMR' }],
        ['https://api.com/stores/2/', { name: 'Lider', preferred_payment_method: 'Tarjeta Lider BCI' }]
    ]),

    mockEntities: [
        {
            active_registry: { offer_price: '799990', normal_price: '849990' },
            store: 'https://api.com/stores/1/',
            external_url: 'https://falabella.com/producto/iphone-16-pro'
        },
        {
            active_registry: { offer_price: '799990', normal_price: '829990' },
            store: 'https://api.com/stores/2/',
            external_url: 'https://lider.cl/producto/iphone-16-pro'
        }
    ],

    product: {
        id: 999101,
        name: 'Apple iPhone 16 Pro 128GB (Simulación Track Link)',
        slug: 'apple-iphone-16-pro-128gb',
        offerPrice: 799990,
        normalPrice: 829990,
        pictureUrl: 'https://media.solotodo.com/media/products/2117019'
    },

    stored: {
        minOfferPrice: 899990,
        minNormalPrice: 949990,
        lastOfferPrice: 899990,
        lastNormalPrice: 949990,
    },

    triggers: ['NEW_LOW_OFFER'],
    previousOfferPrice: 899990,
    previousNormalPrice: 949990
};
