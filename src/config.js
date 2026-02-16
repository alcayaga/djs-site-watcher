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
 * Checks if a value is a placeholder string (e.g., starting with 'YOUR_').
 * @param {string} value The value to check.
 * @returns {boolean} True if it's a placeholder.
 */
const isPlaceholder = (value) => typeof value === 'string' && value.startsWith('YOUR_');

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
config.ALLOW_PRIVATE_IPS = String(config.ALLOW_PRIVATE_IPS).toLowerCase() === 'true';

if (config.ALLOW_PRIVATE_IPS) {
    console.warn('⚠️ SSRF Protection bypass is ACTIVE (ALLOW_PRIVATE_IPS=true). Private IPs will be allowed.');
}

const defaultMonitors = require('./defaultMonitors.js');

if (!config.monitors) {
    config.monitors = defaultMonitors;
} else {
    // Merge user-defined monitors with defaults
    config.monitors = config.monitors.map(userMonitor => {
        const defaultMonitor = defaultMonitors.find(m => m.name === userMonitor.name);
        return defaultMonitor ? { ...defaultMonitor, ...userMonitor } : userMonitor;
    });
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
    
    if (!monitor.channelId || isPlaceholder(monitor.channelId)) {
        const fallbackId = defaults.channelId ?? config.defaultChannelId;
        if (!fallbackId || isPlaceholder(fallbackId)) {
            console.warn(`⚠️ Monitor '${monitor.name}' is missing a valid 'channelId'. Notifications for this monitor will fail.`);
        }
        monitor.channelId = fallbackId;
    }

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
    const handlerChannelMap = Object.fromEntries(
        defaultHandlerMappings.map(mapping => [mapping.handler, process.env[mapping.envId]])
    );
    const handlerMappingsMap = Object.fromEntries(
        defaultHandlerMappings.map(mapping => [mapping.handler, mapping])
    );

    config.channels.forEach(channel => {
        // Apply channelId fallbacks
        if (!channel.channelId || isPlaceholder(channel.channelId)) {
            const mappedId = handlerChannelMap[channel.handler];
            const fallbackId = mappedId ?? config.defaultChannelId;
            
            if (!fallbackId || isPlaceholder(fallbackId)) {
                console.warn(`⚠️ Channel handler '${channel.name}' is missing a valid 'channelId'. This handler may not function correctly.`);
            } else if (!mappedId || isPlaceholder(mappedId)) {
                console.warn(`⚠️ Channel handler '${channel.name}' is missing 'channelId'. Falling back to default channel ID.`);
            }
            
            channel.channelId = fallbackId;
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
