const { extractQuery } = require('../../src/utils/solotodo');

describe('Debug Solotodo Extraction', () => {
    it('should extract correct query from user example', () => {
        const input = '200 Lucas > https://www.paris.cl/apple-airpods-pro-2da-generacion-con-estuche-de-carga-magsafe-usb-c-556043999.html';
        const query = extractQuery(input);
        console.log('Extracted Query:', query);
        expect(query).toBeDefined();
    });
});
