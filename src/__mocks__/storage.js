module.exports = {
    read: jest.fn(),
    write: jest.fn(),
    loadSettings: jest.fn().mockReturnValue({
        interval: 5,
        debug: false,
    }),
    loadSites: jest.fn(),
    loadResponses: jest.fn(),
    migrateLegacyData: jest.fn(),
    ensureConfigFiles: jest.fn(),
    saveSettings: jest.fn(),
    SENSITIVE_SETTINGS_KEYS: [],
    REQUIRED_ENV_VARS: [],
    OPTIONAL_ENV_VARS: [],
};
