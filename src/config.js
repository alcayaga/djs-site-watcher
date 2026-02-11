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

// Load environment variables.
storage.SENSITIVE_SETTINGS_KEYS.forEach(key => {
    if (process.env[key] !== undefined) {
        const isRequired = storage.REQUIRED_ENV_VARS.includes(key);
        // Required vars (Secrets) take precedence from process.env.
        // Others act as fallbacks if not in config.
        if (isRequired || config[key] === undefined) {
            config[key] = process.env[key];
        }
    }
});

const missingRequiredVars = storage.REQUIRED_ENV_VARS.filter(key => !config[key]);

if (process.env.NODE_ENV !== 'test' && missingRequiredVars.length > 0) {
    throw new Error(`❌ Missing required environment variables: ${missingRequiredVars.join(', ')}. Please set them in your .env file or environment variables.`);
}

const missingOptionalVars = storage.OPTIONAL_ENV_VARS.filter(key => !config[key]);
if (process.env.NODE_ENV !== 'test' && missingOptionalVars.length > 0) {
    console.warn(`⚠️  Missing optional environment variables: ${missingOptionalVars.join(', ')}. Some features may not work as expected.`);
}

// Map Global Default
config.defaultChannelId = config.defaultChannelId ?? process.env.DISCORDJS_TEXTCHANNEL_ID;

/**
 * Parses an environment variable as an integer with a default value.
 * @param {string|number} value The value to parse.
 * @param {number} defaultValue The default value if parsing fails.
 * @returns {number} The parsed integer or default value.
 */
const parseEnvInt = (value, defaultValue) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

// Type conversions and defaults
config.AP_RESPONSE_DELAY = parseEnvInt(config.AP_RESPONSE_DELAY, 5000);
config.SOLOTODO_API_DELAY = parseEnvInt(config.SOLOTODO_API_DELAY, 5000);

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
const monitorDefaults = {
    'Deal': {
        channelId: process.env.DISCORDJS_DEALS_CHANNEL_ID,
        apiDelay: config.SOLOTODO_API_DELAY
    }
};

config.monitors.forEach(monitor => {
    const defaults = monitorDefaults[monitor.name] || {};
    monitor.channelId = monitor.channelId ?? defaults.channelId ?? config.defaultChannelId;
    if (defaults.apiDelay !== undefined) {
        monitor.apiDelay = monitor.apiDelay ?? defaults.apiDelay;
    }
});

const defaultHandlerMappings = [
    { name: 'QA', handler: 'QAChannel', envId: 'DISCORDJS_APCHANNEL_ID', defaults: { responseDelay: config.AP_RESPONSE_DELAY } },
    { name: 'Deals', handler: 'DealsChannel', envId: 'DISCORDJS_DEALS_CHANNEL_ID' }
];

if (!config.channels) {
    config.channels = defaultHandlerMappings.map(m => ({
        name: m.name,
        handler: m.handler,
        enabled: true,
        channelId: process.env[m.envId] ?? config.defaultChannelId,
        ...m.defaults
    }));
} else {
    // Re-link IDs from environment variables for default handlers if they are missing in the JSON
    const { handlerChannelMap, handlerMappingsMap } = defaultHandlerMappings.reduce((acc, mapping) => {
        acc.handlerChannelMap[mapping.handler] = process.env[mapping.envId];
        acc.handlerMappingsMap[mapping.handler] = mapping;
        return acc;
    }, { handlerChannelMap: {}, handlerMappingsMap: {} });

    config.channels.forEach(channel => {
        // Apply channelId fallbacks
        if (!channel.channelId) {
            const mappedId = handlerChannelMap[channel.handler];
            channel.channelId = mappedId ?? config.defaultChannelId;
            if (!mappedId && config.defaultChannelId) {
                console.warn(`⚠️ Channel handler '${channel.name}' is missing 'channelId' and has no default mapping. Falling back to default channel ID.`);
            }
        }

        // Apply other defaults if missing
        const mapping = handlerMappingsMap[channel.handler];
        if (mapping && mapping.defaults) {
            for (const key in mapping.defaults) {
                if (channel[key] === undefined) {
                    channel[key] = mapping.defaults[key];
                }
            }
        }
    });
}

module.exports = config;
