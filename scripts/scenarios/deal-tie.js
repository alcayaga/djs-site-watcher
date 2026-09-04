module.exports = {
    mockStores: new Map([
        ['https://api.com/stores/1/', { name: 'Falabella', preferred_payment_method: 'Tarjeta CMR' }],
        ['https://api.com/stores/2/', { name: 'Lider', preferred_payment_method: 'Tarjeta Lider BCI' }]
    ]),
    
    mockEntities: [
        {
            active_registry: { offer_price: '149990', normal_price: '180000' },
            store: 'https://api.com/stores/1/',
            external_url: 'https://falabella.com/airpods-pro-3'
        },
        {
            active_registry: { offer_price: '149990', normal_price: '160000' },
            store: 'https://api.com/stores/2/',
            external_url: 'https://lider.cl/airpods-pro-3-cheaper-normal'
        }
    ],

    product: {
        id: 355272,
        name: 'Apple AirPods Pro 3 (Complex Tie Test)',
        slug: 'apple-airpods-pro-3-tie',
        offerPrice: 149990,
        normalPrice: 160000,
        pictureUrl: 'https://media.solotodo.com/media/products/2117019'
    },

    stored: {
        minOfferPrice: 249990,
        minNormalPrice: 279990,
        lastOfferPrice: 249990,
        lastNormalPrice: 279990,
    },

    triggers: ['NEW_LOW_OFFER'],
    previousOfferPrice: 249990,
    previousNormalPrice: 279990
};
