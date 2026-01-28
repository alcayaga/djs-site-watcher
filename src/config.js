/**
 * Configuration module that loads environment variables and settings from storage.
 * @module config
 */
require('dotenv').config();

const storage = require('./storage.js');

const config = storage.loadSettings();

config.DISCORDJS_BOT_TOKEN = process.env.DISCORDJS_BOT_TOKEN;
config.DISCORDJS_TEXTCHANNEL_ID = process.env.DISCORDJS_TEXTCHANNEL_ID;
config.DISCORDJS_ADMINCHANNEL_ID = process.env.DISCORDJS_ADMINCHANNEL_ID;
config.DISCORDJS_ROLE_ID = process.env.DISCORDJS_ROLE_ID;
config.SINGLE_RUN = process.env.SINGLE_RUN;

config.monitors = [
    {
        name: 'AppleEsim',
        enabled: true,
        url: 'https://support.apple.com/en-us/101569',
        file: './src/apple_esim.json',
        country: 'Chile',
    },
    {
        name: 'Carrier',
        enabled: true,
        url: 'https://s.mzstatic.com/version',
        file: './src/carriers.json',
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
        file: './src/apple_features.json',
        keywords: ['chile', 'spanish (latin america)', 'scl'],
    },
    {
        name: 'ApplePay',
        enabled: true,
        file: './src/apple_pay_responses.json',
        configUrl: 'https://smp-device-content.apple.com/static/region/v2/config.json',
        configAltUrl: 'https://smp-device-content.apple.com/static/region/v2/config-alt.json',
        region: 'CL',
    },
];

module.exports = config;
