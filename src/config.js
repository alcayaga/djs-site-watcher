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

// Load optional environment variables (which might now be in settings.json but could still be in .env)
storage.OPTIONAL_ENV_VARS.forEach(key => {
    if (process.env[key] !== undefined && config[key] === undefined) {
        config[key] = process.env[key];
    }
});

const missingRequiredVars = storage.REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (process.env.NODE_ENV !== 'test' && missingRequiredVars.length > 0) {
    throw new Error(`❌ Missing required environment variables: ${missingRequiredVars.join(', ')}. Please set them in your .env file or environment variables.`);
}

// Map Global Default
config.defaultChannelId = config.defaultChannelId || process.env.DISCORDJS_TEXTCHANNEL_ID;

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

// Initialize specific monitor settings if missing
config.monitors.forEach(monitor => {
    if (monitor.name === 'Deal') {
        monitor.channelId = monitor.channelId || process.env.DISCORDJS_DEALS_CHANNEL_ID || config.defaultChannelId;
        monitor.apiDelay = monitor.apiDelay !== undefined ? monitor.apiDelay : config.SOLOTODO_API_DELAY;
    } else {
        monitor.channelId = monitor.channelId || config.defaultChannelId;
    }
});

const defaultHandlerMappings = [
    { name: 'QA', handler: 'QAChannel', envId: 'DISCORDJS_APCHANNEL_ID' },
    { name: 'Deals', handler: 'DealsChannel', envId: 'DISCORDJS_DEALS_CHANNEL_ID' }
];

if (!config.channels) {
    config.channels = defaultHandlerMappings.map(m => ({
        name: m.name,
        handler: m.handler,
        enabled: true,
        channelId: process.env[m.envId] || config.defaultChannelId
    }));
} else {
    // Re-link IDs from environment variables for default handlers if they are missing in the JSON
    const handlerChannelMap = Object.fromEntries(
        defaultHandlerMappings.map(m => [m.handler, process.env[m.envId]])
    );

    config.channels.forEach(channel => {
        if (!channel.channelId) {
            channel.channelId = handlerChannelMap[channel.handler] || config.defaultChannelId;
        }
    });
}

// Set channel-specific settings
config.channels.forEach(channel => {
    if (channel.handler === 'QAChannel') {
        channel.responseDelay = channel.responseDelay !== undefined ? channel.responseDelay : config.AP_RESPONSE_DELAY;
    }
});

module.exports = config;