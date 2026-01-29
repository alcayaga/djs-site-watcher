const storage = require('../src/storage');
const fs = require('fs-extra');

jest.mock('fs-extra');

describe('storage', () => {
    describe('loadSites', () => {
        it('should return the array if the file contains an array', () => {
            const mockSites = [{ id: 'site1' }];
            fs.readJSONSync.mockReturnValue(mockSites);

            const result = storage.loadSites();
            expect(result).toEqual(mockSites);
        });

        it('should return the sites property if the file contains an object with sites array', () => {
            const mockSites = [{ id: 'site1' }];
            const mockFileContent = { sites: mockSites };
            fs.readJSONSync.mockReturnValue(mockFileContent);

            const result = storage.loadSites();
            expect(result).toEqual(mockSites);
        });

        it('should return empty array if file content is empty/invalid', () => {
             fs.readJSONSync.mockReturnValue({});
             const result = storage.loadSites();
             expect(result).toEqual([]);
        });
        
        it('should return empty array if readJSONSync throws', () => {
            fs.readJSONSync.mockImplementation(() => { throw new Error('File not found'); });
            const result = storage.loadSites();
            expect(result).toEqual([]);
        });
    });
});
