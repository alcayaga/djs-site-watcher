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

// Load sensitive environment variables defined in storage.js
storage.SENSITIVE_SETTINGS_KEYS.forEach(key => {
    if (process.env[key] !== undefined) {
        config[key] = process.env[key];
    }
});

// Type conversions and defaults
config.AP_RESPONSE_DELAY = config.AP_RESPONSE_DELAY ? parseInt(config.AP_RESPONSE_DELAY, 10) : 5000;

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



if (!config.channels) {
    config.channels = [
        {
            name: 'QA',
            handler: 'QA',
            enabled: true,
            channelId: config.DISCORDJS_APCHANNEL_ID,
        },
        {
            name: 'Deals',
            handler: 'Deals',
            enabled: true,
            channelId: config.DISCORDJS_DEALS_CHANNEL_ID,
        }
    ];
} else {
    // Re-link IDs from environment variables for default handlers if they are missing in the JSON
    const handlerChannelMap = {
        'QA': config.DISCORDJS_APCHANNEL_ID,
        'Deals': config.DISCORDJS_DEALS_CHANNEL_ID,
    };

    config.channels.forEach(channel => {
        if (!channel.channelId) {
            if (handlerChannelMap[channel.handler]) {
                channel.channelId = handlerChannelMap[channel.handler];
            } else {
                console.warn(`Channel handler ${channel.name} is enabled but missing 'channelId' and has no default mapping.`);
            }
        }
    });
}



module.exports = config;
