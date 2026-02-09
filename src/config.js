/**
 * Configuration module that loads environment variables and settings from storage.
 * @module config
 */
try {
    process.loadEnvFile();
} catch (err) {
    if (err.code === 'ENOENT') {
        console.warn('⚠️ No .env file found. Proceeding with process.env variables.');
    } else {
        throw err;
    }
}

const storage = require('./storage.js');

const config = storage.loadSettings();

// Load sensitive environment variables defined in storage.js
storage.SENSITIVE_SETTINGS_KEYS.forEach(key => {
    if (process.env[key] !== undefined) {
        config[key] = process.env[key];
    }
});

const missingRequiredVars = storage.REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (process.env.NODE_ENV !== 'test' && missingRequiredVars.length > 0) {
    throw new Error(`❌ Missing required environment variables: ${missingRequiredVars.join(', ')}. Please set them in your .env file or environment variables.`);
}

const missingOptionalVars = storage.OPTIONAL_ENV_VARS.filter(key => !process.env[key]);
if (process.env.NODE_ENV !== 'test' && missingOptionalVars.length > 0) {
    console.warn(`⚠️  Missing optional environment variables: ${missingOptionalVars.join(', ')}. Some features may not work as expected.`);
}

// Type conversions and defaults
config.AP_RESPONSE_DELAY = config.AP_RESPONSE_DELAY ? parseInt(config.AP_RESPONSE_DELAY, 10) : 5000;
config.SOLOTODO_API_DELAY = (p => Number.isFinite(p) ? p : 5000)(parseInt(config.SOLOTODO_API_DELAY, 10));

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
            name: 'Deal',
            enabled: true,
            url: [
                'https://publicapi.solotodo.com/categories/50/browse/?brands=756403&brands=769114',
                'https://publicapi.solotodo.com/categories/6/browse/?brands=149039',
                'https://publicapi.solotodo.com/categories/25/browse/?brands=944507'
            ],
            file: './config/deals.json',
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
            handler: 'QAChannel',
            enabled: true,
            channelId: config.DISCORDJS_APCHANNEL_ID,
        },
        {
            name: 'Deals',
            handler: 'DealsChannel',
            enabled: true,
            channelId: config.DISCORDJS_DEALS_CHANNEL_ID,
        }
    ];
} else {
    // Re-link IDs from environment variables for default handlers if they are missing in the JSON
    const handlerChannelMap = {
        'QAChannel': config.DISCORDJS_APCHANNEL_ID,
        'DealsChannel': config.DISCORDJS_DEALS_CHANNEL_ID,
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
