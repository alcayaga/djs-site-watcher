const { SOLOTODO_API_URL } = require('./utils/constants');

/**
 * Default monitor configurations.
 * @module defaultMonitors
 */
const defaultMonitors = [
    {
        name: 'AppleEsim',
        enabled: true,
        url: 'https://support.apple.com/en-us/101569',
        file: './config/apple_esim.json',
        country: 'Chile',
    },
    {
        name: 'Carrier',
        enabled: true,
        url: 'https://s.mzstatic.com/version',
        file: './config/carriers.json',
        carriers: [
            'EntelPCS_cl',
            'movistar_cl',
            'Claro_cl',
            'Nextel_cl'
        ],
    },
    {
        name: 'AppleFeature',
        enabled: true,
        url: 'https://www.apple.com/ios/feature-availability/',
        file: './config/apple_features.json',
        keywords: ['chile', 'spanish (latin america)', 'scl'],
    },
    {
        name: 'ApplePay',
        enabled: true,
        file: './config/apple_pay_responses.json',
        configUrl: 'https://smp-device-content.apple.com/static/region/v2/config.json',
        configAltUrl: 'https://smp-device-content.apple.com/static/region/v2/config-alt.json',
        region: 'CL',
    },
    {
        name: 'Deal',
        enabled: true,
        url: [
            `${SOLOTODO_API_URL}/categories/50/browse/?brands=756403&brands=769114`,
            `${SOLOTODO_API_URL}/categories/6/browse/?brands=149039`,
            `${SOLOTODO_API_URL}/categories/25/browse/?brands=944507`
        ],
        file: './config/deals.json',
    },
    {
        name: 'Site',
        enabled: true,
        file: './config/sites.json',
    },
];

module.exports = defaultMonitors;
