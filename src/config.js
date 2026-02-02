/**
 * Configuration module that loads environment variables and settings from storage.
 * @module config
 */
try {
    process.loadEnvFile();
} catch (err) {
    if (err.code !== 'ENOENT') throw err;
}

const storage = require('./storage.js');

const config = storage.loadSettings();

config.DISCORDJS_BOT_TOKEN = process.env.DISCORDJS_BOT_TOKEN;
config.DISCORDJS_CLIENT_ID = process.env.DISCORDJS_CLIENT_ID;
config.DISCORDJS_TEXTCHANNEL_ID = process.env.DISCORDJS_TEXTCHANNEL_ID;
config.DISCORDJS_ADMINCHANNEL_ID = process.env.DISCORDJS_ADMINCHANNEL_ID;
config.DISCORDJS_ROLE_ID = process.env.DISCORDJS_ROLE_ID;
config.DISCORDJS_APCHANNEL_ID = process.env.DISCORDJS_APCHANNEL_ID;
config.SINGLE_RUN = process.env.SINGLE_RUN;

if (!config.monitors) {
    config.monitors = [
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
            name: 'Site',
            enabled: true,
            file: './config/sites.json',
        },
    ];
}

module.exports = config;
