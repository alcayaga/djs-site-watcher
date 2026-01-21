const mockHtml = `
<html>
<body>
    <section class="features">
        <h2>Feature 1</h2>
        <ul>
            <li>Spanish (Chile)</li>
            <li>English (US)</li>
        </ul>
    </section>
    <section class="features">
        <h2>Feature 2</h2>
        <ul>
            <li>English (UK)</li>
            <li>Spanish (Latin America)</li>
        </ul>
    </section>
    <section class="features">
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

            const secondCall = mockChannel.send.mock.calls[1][0];
            expect(secondCall.addField).toHaveBeenCalledWith('Función', 'Feature 2');
            expect(secondCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Spanish (Latin America)');
            
            const thirdCall = mockChannel.send.mock.calls[2][0];
            expect(thirdCall.addField).toHaveBeenCalledWith('Función', 'Feature 3 (SCL)');
            expect(thirdCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Some City (SCL)');
        });

        test('should detect a new region for an existing feature and notify', async () => {
            const initialFeatures = {
                'Feature 1': ['Some other region']
            };
            fs.readJSON.mockResolvedValue(initialFeatures);
            await initialize();

            await check(mockClient);

            // Should notify for the new region in Feature 1, and for Feature 2 and 3
            expect(mockChannel.send).toHaveBeenCalledTimes(3);
            
            const firstCall = mockChannel.send.mock.calls[0][0];
            expect(firstCall.addField).toHaveBeenCalledWith('Función', 'Feature 1');
            expect(firstCall.addField).toHaveBeenCalledWith('Región/Idioma', 'Spanish (Chile)');
        });

        test('should not notify if no changes are detected', async () => {
            const initialFeatures = {
                'Feature 1': ['Spanish (Chile)'],
                'Feature 2': ['Spanish (Latin America)'],
                'Feature 3 (SCL)': ['Some City (SCL)']
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
    });
});
