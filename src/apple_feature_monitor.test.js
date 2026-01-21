const mockHtml = `
<html>
<body>
    <section id="feature-1" class="features">
        <h2>Feature 1</h2>
        <ul>
            <li>Spanish (Chile)</li>
            <li>English (US)</li>
        </ul>
    </section>
    <section id="feature-2" class="features">
        <h2>Feature 2</h2>
        <ul>
            <li>English (UK)</li>
            <li>Spanish (Latin America)</li>
        </ul>
    </section>
    <section id="feature-3-scl" class="features">
        <h2>Feature 3 (SCL)</h2>
        <ul>
            <li>Some City (SCL)</li>
        </ul>
    </section>
</body>
</html>
`;

jest.mock('fs-extra');
jest.mock('got');
jest.mock('discord.js');

describe('Apple Feature Monitor', () => {
    let mockClient;
    let mockChannel;
    let fs;
    let got;
    let initialize;
    let check;
    let Discord;

    beforeEach(() => {
        jest.resetModules();

        fs = require('fs-extra');
        got = require('got');
        Discord = require('discord.js');
        const appleFeatureMonitor = require('./apple_feature_monitor');
        initialize = appleFeatureMonitor.initialize;
        check = appleFeatureMonitor.check;

        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get();
        got.mockResolvedValue({ body: mockHtml });
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mock-channel-id';
    });

    describe('check', () => {
        test('should detect a new feature and notify', async () => {
            fs.readJSON.mockResolvedValue({}); // No features monitored initially
            await initialize();

            await check(mockClient);

            expect(mockChannel.send).toHaveBeenCalledTimes(3);
            expect(fs.outputJSON).toHaveBeenCalled();

            const firstCall = mockChannel.send.mock.calls[0][0];
            expect(firstCall.addField).toHaveBeenCalledWith('Función', 'Feature 1');
            expect(firstCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Spanish (Chile)');
            expect(firstCall.addField).toHaveBeenCalledWith('URL', 'https://www.apple.com/ios/feature-availability/#feature-1');

            const secondCall = mockChannel.send.mock.calls[1][0];
            expect(secondCall.addField).toHaveBeenCalledWith('Función', 'Feature 2');
            expect(secondCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Spanish (Latin America)');
            expect(secondCall.addField).toHaveBeenCalledWith('URL', 'https://www.apple.com/ios/feature-availability/#feature-2');
            
            const thirdCall = mockChannel.send.mock.calls[2][0];
            expect(thirdCall.addField).toHaveBeenCalledWith('Función', 'Feature 3 (SCL)');
            expect(thirdCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Some City (SCL)');
            expect(thirdCall.addField).toHaveBeenCalledWith('URL', 'https://www.apple.com/ios/feature-availability/#feature-3-scl');
        });

        test('should detect a new region for an existing feature and notify', async () => {
            const initialFeatures = {
                'Feature 1': { regions: ['Some other region'], id: 'feature-1' }
            };
            fs.readJSON.mockResolvedValue(initialFeatures);
            await initialize();

            await check(mockClient);

            // Should notify for the new region in Feature 1, and for Feature 2 and 3
            expect(mockChannel.send).toHaveBeenCalledTimes(3);
            
            const firstCall = mockChannel.send.mock.calls[0][0];
            expect(firstCall.addField).toHaveBeenCalledWith('Función', 'Feature 1');
            expect(firstCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Spanish (Chile)');
            expect(firstCall.addField).toHaveBeenCalledWith('URL', 'https://www.apple.com/ios/feature-availability/#feature-1');
        });

        test('should not notify if no changes are detected', async () => {
            const initialFeatures = {
                'Feature 1': { regions: ['Spanish (Chile)'], id: 'feature-1' },
                'Feature 2': { regions: ['Spanish (Latin America)'], id: 'feature-2' },
                'Feature 3 (SCL)': { regions: ['Some City (SCL)'], id: 'feature-3-scl' }
            };
            fs.readJSON.mockResolvedValue(initialFeatures);
            await initialize();
            
            await check(mockClient);

            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(fs.outputJSON).not.toHaveBeenCalled();
        });

        test('should handle error when fetching feature data', async () => {
            got.mockRejectedValue(new Error('Fetch error'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            await check(mockClient);

            expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking for Apple features:', new Error('Fetch error'));
            expect(mockChannel.send).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        test('should handle old data structure gracefully', async () => {
            const oldDataStructure = {
                'Feature 1': ['Spanish (Chile)'], // Old array format
                'Feature 2': ['Some other region']
            };
            const mockHtmlWithNewRegion = `
                <html>
                <body>
                    <section id="feature-1" class="features">
                        <h2>Feature 1</h2>
                        <ul>
                            <li>Spanish (Chile)</li>
                            <li>Spanish (Latin America)</li>
                        </ul>
                    </section>
                </body>
                </html>
            `;
            got.mockResolvedValue({ body: mockHtmlWithNewRegion });

            fs.readJSON.mockResolvedValue(oldDataStructure);
            await initialize();
            await check(mockClient);

            // Should notify for the new region in Feature 1
            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            const sentEmbed = mockChannel.send.mock.calls[0][0];
            expect(sentEmbed.addField).toHaveBeenCalledWith('Función', 'Feature 1');
            expect(sentEmbed.addField).toHaveBeenCalledWith('Región/Idioma', 'Spanish (Latin America)');
        });
    });
});
