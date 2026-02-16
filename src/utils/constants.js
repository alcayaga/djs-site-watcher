// Solotodo API Constants
const SOLOTODO_BASE_URL = process.env.SOLOTODO_BASE_URL || 'https://www.solotodo.cl';
const SOLOTODO_API_URL = process.env.SOLOTODO_API_URL || 'https://publicapi.solotodo.com';
const SOLOTODO_CLP_CURRENCY_ID = '1';
const SOLOTODO_USD_CURRENCY_ID = '4';
const SOLOTODO_CLP_CURRENCY_URL = `${SOLOTODO_API_URL}/currencies/${SOLOTODO_CLP_CURRENCY_ID}/`;
const SOLOTODO_USD_CURRENCY_URL = `${SOLOTODO_API_URL}/currencies/${SOLOTODO_USD_CURRENCY_ID}/`;
const CHILE_COUNTRY_ID = '1';

const REFURBISHED_CONDITION_URL = 'https://schema.org/RefurbishedCondition';
const NEW_CONDITION_URL = 'https://schema.org/NewCondition';

const MIN_DESCRIPTIVE_SLUG_LENGTH = 5;
const MAX_SKU_LIKE_SLUG_LENGTH = 10;

// Domains that serve broken or non-standard images for Apple products.
const BANNED_PICTURE_DOMAINS = [
    'tienda.travel.cl',
    'dojiw2m9tvv09.cloudfront.net'
];

// List of known Apple products to prioritize extraction.
// Sorted by specificity (longer strings first) to ensure "Pro Max" matches before "Pro".
const APPLE_PRODUCTS = [
    // Vision
    'Apple Vision Pro',

    // iPhone
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17 Plus', 'iPhone 17',
    'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13 mini', 'iPhone 13',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12 mini', 'iPhone 12',
    'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
    'iPhone SE', 'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
    
    // iPad
    'iPad Pro 13', 'iPad Pro 12.9', 'iPad Pro 11', 'iPad Pro',
    'iPad Air 13', 'iPad Air 11', 'iPad Air', 'iPad mini', 'iPad',

    // Mac
    'MacBook Pro', 'MacBook Air', 'MacBook',
    'Mac mini', 'Mac Studio', 'Mac Pro', 'iMac',

    // Watch
    'Apple Watch Ultra 2', 'Apple Watch Ultra', 'Apple Watch Series 10', 
    'Apple Watch Series 9', 'Apple Watch Series 8', 
    'Apple Watch Series 7', 'Apple Watch SE', 'Apple Watch',

    // Audio / Accessories
    'AirPods Max', 'AirPods Pro', 'AirPods 4', 'AirPods',
    'HomePod mini', 'HomePod',
    'Apple TV 4K', 'Apple TV',
    'Studio Display', 'Pro Display XDR',
    'Magic Keyboard', 'Magic Mouse', 'Magic Trackpad', 
    'Apple Pencil Pro', 'Apple Pencil',
    'Beats Pill', 'Beats'
].sort((a, b) => b.length - a.length);

module.exports = {
    SOLOTODO_BASE_URL,
    SOLOTODO_API_URL,
    SOLOTODO_CLP_CURRENCY_ID,
    SOLOTODO_USD_CURRENCY_ID,
    SOLOTODO_CLP_CURRENCY_URL,
    SOLOTODO_USD_CURRENCY_URL,
    CHILE_COUNTRY_ID,
    REFURBISHED_CONDITION_URL,
    NEW_CONDITION_URL,
    MIN_DESCRIPTIVE_SLUG_LENGTH,
    MAX_SKU_LIKE_SLUG_LENGTH,
    BANNED_PICTURE_DOMAINS,
    APPLE_PRODUCTS
};
