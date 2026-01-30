const path = require('path');

// Mock fs-extra
jest.mock('fs-extra');

describe('Migration Logic', () => {
    const LEGACY_DIR = './src';
    const NEW_DIR = './config';
    let storage;
    let fs; // Define fs here

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        
        // Re-require fs-extra to get the FRESH mock associated with the current module registry
        fs = require('fs-extra');
        
        // Re-require storage to get a fresh instance that uses the FRESH fs-extra mock
        storage = require('../src/storage');
    });

    it('should move legacy files to config directory if they exist in src but not config', () => {
        // Setup mocks using the fresh fs instance
        fs.existsSync.mockImplementation((filePath) => {
            const p = path.normalize(filePath);
            const legacyDir = path.normalize(LEGACY_DIR);
            const newDir = path.normalize(NEW_DIR);

            if (p === newDir) return false; // Config dir doesn't exist yet
            
            // Check if it's a file in the legacy dir
            if (p.startsWith(legacyDir) && p.endsWith('.json')) return true;
            
            // Check if it's a file in the new dir
            if (p.startsWith(newDir) && p.endsWith('.json')) return false; 
            
            return false;
        });
        
        fs.ensureDirSync.mockImplementation(() => {});
        fs.moveSync.mockImplementation(() => {});
        fs.readFileSync.mockReturnValue('{}'); // Default content
        fs.writeFileSync.mockImplementation(() => {});

        // Explicitly call migration function
        storage.migrateLegacyData();

        // Check if directory was created
        expect(fs.ensureDirSync).toHaveBeenCalledWith(NEW_DIR);

        // Check if critical files were moved
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
            return true; // Both source and dest exist
        });
        
        fs.ensureDirSync.mockImplementation(() => {});
        fs.moveSync.mockImplementation(() => {});

        // Explicitly call migration function
        storage.migrateLegacyData();

        // Should not have attempted to move anything
        expect(fs.moveSync).not.toHaveBeenCalled();
    });

    it('should patch settings.json content after moving', () => {
        // Setup mocks for moving specifically settings.json
        fs.existsSync.mockImplementation((filePath) => {
            const p = path.normalize(filePath);
            const newDir = path.normalize(NEW_DIR);
            const legacyDir = path.normalize(LEGACY_DIR);

            if (p === newDir) return true;
            if (p === path.join(legacyDir, 'settings.json')) return true;
            if (p === path.join(newDir, 'settings.json')) return false; // Doesn't exist yet, so we move it
            return false;
        });

        fs.moveSync.mockImplementation(() => {});
        
        // Mock the content of settings.json
        const mockSettingsContent = JSON.stringify({
            file: "./src/sites.json",
            other: "./src/other.json"
        });
        fs.readFileSync.mockReturnValue(mockSettingsContent);
        fs.writeFileSync.mockImplementation(() => {});

        // Explicitly call migration function
        storage.migrateLegacyData();

        // Verify move
        expect(fs.moveSync).toHaveBeenCalledWith(
            path.join(LEGACY_DIR, 'settings.json'),
            path.join(NEW_DIR, 'settings.json')
        );

        // Verify patch
        expect(fs.readFileSync).toHaveBeenCalledWith(path.join(NEW_DIR, 'settings.json'), 'utf8');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(NEW_DIR, 'settings.json'),
            expect.stringContaining('"file":"./config/sites.json"'), // Should be replaced
            'utf8'
        );
    });
});
