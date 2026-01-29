const fs = require('fs-extra');

const SITES_FILE = './src/sites.json';
const SETTINGS_FILE = './src/settings.json';
const RESPONSES_FILE = './src/responses.json';

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
  } catch (err) {
    console.log(`Could not read ${SITES_FILE}, creating a new one.`);
    return [];
  }
}

/**
 * Saves the list of monitored sites to the JSON file.
 * @param {Array} sites - The array of site objects to save.
 */
function saveSites(sites) {
  fs.outputJSON(SITES_FILE, sites, { spaces: 2 }, err => {
    if (err) console.log(err);
  });
}

/**
 * Loads the bot's settings from the JSON file.
 * @returns {object} The settings object.
 */
function loadSettings() {
  try {
    return fs.readJSONSync(SETTINGS_FILE);
  } catch (err) {
    console.log(`Could not read ${SETTINGS_FILE}.`);
    return { interval: 5 };
  }
}

/**
 * Saves the bot's settings to the JSON file.
 * @param {object} settings - The settings object to save.
 */
function saveSettings(settings) {
    const settingsToSave = { ...settings };
    delete settingsToSave.DISCORDJS_BOT_TOKEN;
    delete settingsToSave.DISCORDJS_TEXTCHANNEL_ID;
    delete settingsToSave.DISCORDJS_ADMINCHANNEL_ID;
    delete settingsToSave.DISCORDJS_ROLE_ID;
    delete settingsToSave.SINGLE_RUN;

    fs.outputJSON(SETTINGS_FILE, settingsToSave, { spaces: 2 }, err => {
        if (err) console.log(err)
    });
}

/**
 * Loads the bot's responses from the JSON file.
 * @returns {Array} An array of response objects.
 */
function loadResponses() {
    try {
        return fs.readJSONSync(RESPONSES_FILE);
    } catch (err) {
        console.log(`Could not read ${RESPONSES_FILE}.`);
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
    } catch (err) {
        console.log(`Could not read ${file}.`);
        return {};
    }
}

/**
 * Writes data to a JSON file.
 * @param {string} file - The path to the file.
 * @param {object} data - The data to write.
 */
async function write(file, data) {
    await fs.outputJSON(file, data, { spaces: 2 });
}

module.exports = {
  loadSites,
  saveSites,
  loadSettings,
  saveSettings,
  loadResponses,
  read,
  write,
};
