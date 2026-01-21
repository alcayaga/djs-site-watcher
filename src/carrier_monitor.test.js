const mockPlist = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>MobileDeviceCarrierBundlesByProductVersion</key>
    <dict>
        <key>EntelPCS_cl</key>
        <dict>
            <key>1.0</key>
            <dict>
                <key>BuildVersion</key>
                <string>1.0.0</string>
                <key>BundleURL</key>
                <string>http://example.com/entel_1.0.ipcc</string>
            </dict>
            <key>2.0</key>
            <dict>
                <key>BuildVersion</key>
                <string>2.0.0</string>
                <key>BundleURL</key>
                <string>http://example.com/entel_2.0.ipcc</string>
            </dict>
        </dict>
        <key>movistar_cl</key>
        <dict>
            <key>10.0</key>
            <dict>
                <key>BuildVersion</key>
                <string>10.0.0</string>
                <key>BundleURL</key>
                <string>http://example.com/movistar_10.0.ipcc</string>
            </dict>
        </dict>
    </dict>
</dict>
</plist>
`;

jest.mock('fs-extra');
jest.mock('got');
jest.mock('discord.js');

describe('Carrier Monitor', () => {
    let mockClient;
    let mockChannel;
    let fs;
    let got;
    let initialize;
    let check;
    let Discord;

    beforeEach(() => {
        jest.resetModules(); // This is key to resetting state between tests

        fs = require('fs-extra');
        got = require('got');
        Discord = require('discord.js');
        const carrierMonitor = require('./carrier_monitor');
        initialize = carrierMonitor.initialize;
        check = carrierMonitor.check;

        mockClient = new Discord.Client();
        mockChannel = mockClient.channels.cache.get();
        got.mockResolvedValue({ body: mockPlist });
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mock-channel-id';
    });

    describe('initialize', () => {
        test('should load existing carriers from file', async () => {
            const mockCarriers = [{ id: 'EntelPCS_cl', version: '1.0', build: '1.0.0' }];
            fs.readJSON.mockResolvedValue(mockCarriers);
            await initialize(mockClient);
            expect(fs.readJSON).toHaveBeenCalledWith('./src/carriers.json');
        });

        test('should handle error when reading carriers file', async () => {
            fs.readJSON.mockRejectedValue(new Error('File not found'));
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            await initialize(mockClient);
            expect(consoleLogSpy).toHaveBeenCalledWith('Cannot read carriers.json');
            consoleLogSpy.mockRestore();
        });
    });

    describe('check', () => {
        test('should detect a new carrier version and notify', async () => {
            const initialCarriers = [
                { id: 'EntelPCS_cl', version: '1.0', build: '1.0.0' },
                { id: 'movistar_cl', version: '10.0', build: '10.0.0' }
            ];
            fs.readJSON.mockResolvedValue(initialCarriers);
            await initialize(mockClient);

            await check(mockClient);

            expect(mockChannel.send).toHaveBeenCalledTimes(1);
            const sentEmbed = mockChannel.send.mock.calls[0][0];
            expect(sentEmbed).toBeInstanceOf(Discord.MessageEmbed);
            expect(sentEmbed.setTitle).toHaveBeenCalledWith('📲 ¡Nuevo Carrier Bundle para EntelPCS_cl!');
            expect(sentEmbed.addField).toHaveBeenCalledWith('Versión', '2.0');
            expect(fs.outputJSON).toHaveBeenCalled();
        });
        
        test('should detect a new carrier and notify', async () => {
            const initialCarriers = [{ id: 'SomeOtherCarrier', version: '1.0', build: '1.0.0' }];
            fs.readJSON.mockResolvedValue(initialCarriers);
            await initialize(mockClient);

            await check(mockClient);

            expect(mockChannel.send).toHaveBeenCalledTimes(2);
            expect(fs.outputJSON).toHaveBeenCalled();
        });

        test('should not notify if no changes are detected', async () => {
            const initialCarriers = [
                { id: 'EntelPCS_cl', version: '2.0', build: '2.0.0', url: 'http://example.com/entel_2.0.ipcc' },
                { id: 'movistar_cl', version: '10.0', build: '10.0.0', url: 'http://example.com/movistar_10.0.ipcc' }
            ];
            fs.readJSON.mockResolvedValue(initialCarriers);
            await initialize(mockClient);
            
            await check(mockClient);

            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(fs.outputJSON).not.toHaveBeenCalled();
        });

        test('should handle error when fetching carrier data', async () => {
            got.mockRejectedValue(new Error('Fetch error'));
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await check(mockClient);

            expect(consoleLogSpy).toHaveBeenCalledWith(new Error('Fetch error'));
            expect(mockChannel.send).not.toHaveBeenCalled();
            consoleLogSpy.mockRestore();
        });
    });
});
