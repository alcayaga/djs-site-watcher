const path = require('path');
const fs = require('fs-extra');
const storage = require('../src/storage');

// Mock fs-extra
jest.mock('fs-extra');

describe('Migration Logic', () => {
    const LEGACY_DIR = './src';
    const NEW_DIR = './config';

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock process.exit
        jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    it('should move legacy files to config directory if they exist in src but not config', () => {
        fs.existsSync.mockImplementation((filePath) => {
            const p = path.normalize(filePath);
            const legacyDir = path.normalize(LEGACY_DIR);
            const newDir = path.normalize(NEW_DIR);

            if (p === newDir) return false;
            if (p.startsWith(legacyDir) && p.endsWith('.json')) return true;
            if (p.startsWith(newDir) && p.endsWith('.json')) return false; 
            return false;
        });
        
        fs.ensureDirSync.mockImplementation(() => {});
        fs.moveSync.mockImplementation(() => {});
        fs.readFileSync.mockReturnValue('{}');
        fs.writeFileSync.mockImplementation(() => {});

        storage.migrateLegacyData();

        expect(fs.ensureDirSync).toHaveBeenCalledWith(NEW_DIR);

        const filesToMigrate = [
            'sites.json',
            'settings.json',
            'responses.json',
            'carriers.json',
            'apple_features.json',
            'apple_pay_responses.json',
            'apple_esim.json'
        ];

        filesToMigrate.forEach(file => {
            expect(fs.moveSync).toHaveBeenCalledWith(
                path.join(LEGACY_DIR, file),
                path.join(NEW_DIR, file)
            );
        });
    });

    it('should NOT move files if they already exist in config directory', () => {
        fs.existsSync.mockImplementation((filePath) => {
            const p = path.normalize(filePath);
            const newDir = path.normalize(NEW_DIR);
            if (p === newDir) return true;
            return true;
        });
        
        fs.ensureDirSync.mockImplementation(() => {});
        fs.moveSync.mockImplementation(() => {});
        fs.readFileSync.mockReturnValue('{}');

        storage.migrateLegacyData();

        expect(fs.moveSync).not.toHaveBeenCalled();
    });

    it('should patch settings.json content after moving', () => {
        let settingsMoved = false;
        fs.existsSync.mockImplementation((filePath) => {
            const p = path.normalize(filePath);
            const newDir = path.normalize(NEW_DIR);
            const legacyDir = path.normalize(LEGACY_DIR);

            if (p === newDir) return true;
            if (p === path.join(legacyDir, 'settings.json')) return true;
            if (p === path.join(newDir, 'settings.json')) {
                const res = settingsMoved;
                settingsMoved = true; // Next time it will exist
                return res;
            }
            return false;
        });

        fs.moveSync.mockImplementation(() => {});
        
        const mockSettingsContent = JSON.stringify({
            file: "./src/sites.json",
            other: "./src/other.json"
        });
        fs.readFileSync.mockReturnValue(mockSettingsContent);
        fs.writeFileSync.mockImplementation(() => {});

        storage.migrateLegacyData();

        const expectedContent = JSON.stringify({
            file: "./config/sites.json",
            other: "./config/other.json"
        });
        expect(fs.readFileSync).toHaveBeenCalledWith(path.join(NEW_DIR, 'settings.json'), 'utf8');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(NEW_DIR, 'settings.json'),
            expectedContent,
            'utf8'
        );
    });

    it('should patch settings.json even if it already exists in the destination', () => {
        fs.existsSync.mockImplementation((filePath) => {
            const p = path.normalize(filePath);
            const newPath = path.join(path.normalize(NEW_DIR), 'settings.json');
            if (p === newPath) return true;
            return false;
        });

        const mockSettingsContent = JSON.stringify({
            file: "./src/sites.json"
        });
        fs.readFileSync.mockReturnValue(mockSettingsContent);
        fs.writeFileSync.mockImplementation(() => {});

        storage.migrateLegacyData();

        const expectedContent = JSON.stringify({
            file: "./config/sites.json"
        });
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(NEW_DIR, 'settings.json'),
            expectedContent,
            'utf8'
        );
    });
});
