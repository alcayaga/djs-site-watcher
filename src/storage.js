const fs = require('fs-extra');
const path = require('path');
const logger = require('./utils/logger');
const {
    ENV_DISCORDJS_BOT_TOKEN,
    ENV_DISCORDJS_CLIENT_ID,
    ENV_DISCORDJS_TEXTCHANNEL_ID,
    ENV_DISCORDJS_APCHANNEL_ID,
    ENV_DISCORDJS_DEALS_CHANNEL_ID,
    ENV_ALLOW_PRIVATE_IPS,
    ENV_SINGLE_RUN,
    ENV_AP_RESPONSE_DELAY,
    ENV_SOLOTODO_API_DELAY
} = require('./utils/constants');

const SITES_FILE = './config/sites.json';
const SETTINGS_FILE = './config/settings.json';
const RESPONSES_FILE = './config/responses.json';

const LEGACY_DIR = './src';
const NEW_DIR = './config';

const REQUIRED_ENV_VARS = [
    ENV_DISCORDJS_BOT_TOKEN,
    ENV_DISCORDJS_CLIENT_ID,
];

const OPTIONAL_ENV_VARS = [
    ENV_DISCORDJS_TEXTCHANNEL_ID,
    ENV_DISCORDJS_APCHANNEL_ID,
    ENV_DISCORDJS_DEALS_CHANNEL_ID
];

const SENSITIVE_SETTINGS_KEYS = [
    ...REQUIRED_ENV_VARS,
    ...OPTIONAL_ENV_VARS,
    ENV_ALLOW_PRIVATE_IPS,
    ENV_SINGLE_RUN,
    ENV_AP_RESPONSE_DELAY,
    ENV_SOLOTODO_API_DELAY
];

/**
 * Checks if config files exist, and if not, creates them from examples.
 */
function ensureConfigFiles() {
    const configTargets = [
        SITES_FILE,
        SETTINGS_FILE,
        RESPONSES_FILE
    ];

    if (!fs.existsSync(NEW_DIR)) {
        fs.ensureDirSync(NEW_DIR);
    }

    configTargets.forEach(target => {
        const example = target.replace(/\.json$/, '_example.json');
        if (!fs.existsSync(target)) {
            if (fs.existsSync(example)) {
                logger.info('[Setup] Creating %s from %s', target, example);
                fs.copySync(example, target);
            } else {
                logger.warn('[Setup] Warning: Could not create %s because %s is missing.', target, example);
            }
        }
    });
}

/**
 * Migrates legacy JSON files from src/ to config/ and patches paths.
 */
function migrateLegacyData() {
    const filesToMigrate = [
        'sites.json',
        'settings.json',
        'responses.json',
        'carriers.json',
        'apple_features.json',
        'apple_pay_responses.json',
        'apple_esim.json'
    ];

    if (!fs.existsSync(NEW_DIR)) {
        fs.ensureDirSync(NEW_DIR);
    }

    filesToMigrate.forEach(file => {
        const oldPath = path.join(LEGACY_DIR, file);
        const newPath = path.join(NEW_DIR, file);

        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
            logger.info('[Migration] Moving %s to %s', file, NEW_DIR);
            fs.moveSync(oldPath, newPath);
        } else if (fs.existsSync(oldPath) && fs.existsSync(newPath)) {
            logger.info('[Migration] Skipping moving %s, as it already exists in %s. Please check manually if you have conflicting data.', file, NEW_DIR);
        }
    });

    // Always try to patch settings.json if it exists in the new location
    const settingsPath = path.join(NEW_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            let content = fs.readFileSync(settingsPath, 'utf8');
            if (content.includes('./src/')) {
                logger.info('[Migration] Patching paths in settings.json');
                content = content.replace(/\.\/src\//g, './config/');
                fs.writeFileSync(settingsPath, content, 'utf8');
            }
        } catch (err) {
            logger.error('[Migration] Failed to patch settings.json. Halting execution.', err);
            process.exit(1);
        }
    }
}

/**
 * Loads the list of monitored sites from the JSON file.
 * @returns {Array} An array of site objects.
 */
function loadSites() {
  try {
    const data = fs.readJSONSync(SITES_FILE);
    if (Array.isArray(data)) {
      return data;
    } else if (data && Array.isArray(data.sites)) {
      return data.sites;
    }
    return [];
  } catch {
    logger.info('Could not read %s, creating a new one.', SITES_FILE);
    return [];
  }
}

/**
 * Saves the list of monitored sites to the JSON file.
 * @param {Array} sites - The array of site objects to save.
 * @returns {Promise<void>} A promise that resolves when the file is saved.
 */
function saveSites(sites) {
  return fs.outputJSON(SITES_FILE, sites, { spaces: 2 });
}

/**
 * Loads the bot's settings from the JSON file.
 * @returns {object} The settings object.
 */
function loadSettings() {
  try {
    return fs.readJSONSync(SETTINGS_FILE);
  } catch {
    logger.info('Could not read %s.', SETTINGS_FILE);
    return { interval: 5 };
  }
}

/**
 * Saves the bot's settings to the JSON file.
 * @param {object} settings - The settings object to save.
 * @returns {Promise<void>} A promise that resolves when the file is saved.
 */
function saveSettings(settings) {
    // Scrub sensitive top-level keys
    const settingsToSave = { ...settings };
    SENSITIVE_SETTINGS_KEYS.forEach(key => delete settingsToSave[key]);

    return fs.outputJSON(SETTINGS_FILE, settingsToSave, { spaces: 2 });
}

/**
 * Loads the bot's responses from the JSON file.
 * @returns {Array} An array of response objects.
 */
function loadResponses() {
    try {
        return fs.readJSONSync(RESPONSES_FILE);
    } catch {
        logger.info('Could not read %s.', RESPONSES_FILE);
        return [];
    }
}

/**
 * Reads a JSON file.
 * @param {string} file - The path to the file.
 * @returns {Promise<object>} The parsed JSON object.
 */
async function read(file) {
    try {
        return await fs.readJSON(file);
    } catch {
        logger.info('Could not read %s.', file);
        return {};
    }
}

/**
 * Writes data to a JSON file.
 * @param {string} file - The path to the file.
 * @param {object} data - The data to write.
 * @returns {Promise<void>} A promise that resolves when the file is saved.
 */
async function write(file, data) {
    await fs.outputJSON(file, data, { spaces: 2 });
}

module.exports = {
  migrateLegacyData,
  loadSites,
  saveSites,
  loadSettings,
  saveSettings,
  loadResponses,
  read,
  write,
  SENSITIVE_SETTINGS_KEYS,
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS,
  ensureConfigFiles,
};
