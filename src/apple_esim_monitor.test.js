/**
 * @file Tests for the Apple eSIM Monitor module.
 */

const mockEsimHtml = `
<html>
<body>
    <h2 class="gb-header TAG_123 active">Armenia</h2>
    <ul><li><p><a href="https://www.google.com">Ucom</a></p></li></ul>

    <h2 class="gb-header TAG_456 active">Chile</h2>
    <h3 class="gb-header TAG_456 active">Wireless carriers that support eSIM Quick Transfer</h3>
    <ul class="list gb-list TAG_456 active undecorated-list"><li class="gb-list_item"><p class="gb-paragraph"><a href="https://atencionalcliente.movistar.cl/telefonia-movil/como-funciona-la-esim/" class="gb-anchor">Movistar</a></p></li></ul>
    
    <div class="gb-group">
        <h3 class="gb-header TAG_456 active">Wireless carriers that support other eSIM activation methods</h3>
        <p class="gb-paragraph TAG_456 active">These carriers support other ways of activating eSIM on iPhone, like scanning a QR code or using a carrier app.</p>
        <ul class="list gb-list TAG_456 active undecorated-list">
            <li class="gb-list_item"><p class="gb-paragraph"><a href="https://www.clarochile.cl/personas/servicios/servicios-moviles/esim/" class="gb-anchor">Claro</a></p></li>
            <li class="gb-list_item"><p class="gb-paragraph"><a href="https://ayuda.entel.cl/hc/es-419/articles/4406998318739--C%C3%B3mo-podr%C3%A1-adquirir-una-eSIM-" class="gb-anchor">Entel</a></p></li>
            <li class="gb-list_item"><p class="gb-paragraph"><a href="https://atencionalcliente.movistar.cl/telefonia-movil/como-funciona-la-esim/" class="gb-anchor">Movistar</a></p></li>
            <li class="gb-list_item"><p class="gb-paragraph"><a href="https://www.wom.cl/centro-de-ayuda/quiero-la-esim-como-actualizo-mi-correo-electronico-para-recibir-el-qr-de-activacion/" class="gb-anchor">WOM</a></p></li>
        </ul>
    </div>

    <h2 class="gb-header TAG_789 active">Colombia</h2>
    <ul><li><p><a href="https://www.google.com">Claro</a></p></li></ul>
</body>
</html>
`;

jest.mock('fs-extra');
jest.mock('got');
jest.mock('discord.js', () => {
    const originalDiscord = jest.requireActual('discord.js');
    
    const MessageEmbed = jest.fn(() => ({
        title: '',
        fields: [],
        setTitle: jest.fn(function(title) {
            this.title = title;
            return this;
        }),
        setColor: jest.fn().mockReturnThis(),
        addField: jest.fn(function(name, value) {
            this.fields.push({ name, value });
            return this;
        }),
    }));

    return {
        ...originalDiscord,
        Client: jest.fn(() => ({
            channels: {
                cache: {
                    get: jest.fn(() => ({
                        send: jest.fn().mockResolvedValue(true),
                    })),
                },
            },
        })),
        MessageEmbed,
    };
});

/**
 * Test suite for the Apple eSIM Monitor.
 */
describe('Apple eSIM Monitor', () => {
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
        const appleEsimMonitor = require('./apple_esim_monitor');
        initialize = appleEsimMonitor.initialize;
        check = appleEsimMonitor.check;

        mockClient = new Discord.Client();
        // Mock the client's channels.cache.get method
        mockChannel = {
            send: jest.fn(() => Promise.resolve()),
        };
        mockClient.channels.cache.get = jest.fn(() => mockChannel);

        got.mockResolvedValue({ body: mockEsimHtml });
        process.env.DISCORDJS_TEXTCHANNEL_ID = 'mock-channel-id';
    });

    /**
     * Tests for the check function.
     */
    describe('check', () => {
        test('should detect new carriers and capabilities for Chile, then notify', async () => {
            fs.readJSON.mockResolvedValue({}); // No data monitored initially
            await initialize();
            await check(mockClient);

            expect(mockChannel.send).toHaveBeenCalledTimes(5);
            expect(fs.outputJSON).toHaveBeenCalled();

            const sentEmbeds = mockChannel.send.mock.calls.map(call => call[0]);
            
            const movistarEmbeds = sentEmbeds.filter(embed => embed.fields.some(f => f.value.includes('Movistar')));
            expect(movistarEmbeds.length).toBe(2);

            const quickTransfer = movistarEmbeds.find(e => e.fields.some(f => f.value === 'Wireless carriers that support eSIM Quick Transfer'));
            expect(quickTransfer).toBeDefined();
            expect(quickTransfer.fields).toContainEqual({ name: 'Capacidad', value: 'Wireless carriers that support eSIM Quick Transfer' });
            
            const otherMethods = movistarEmbeds.find(e => e.fields.some(f => f.value === 'Wireless carriers that support other eSIM activation methods'));
            expect(otherMethods).toBeDefined();
            expect(otherMethods.fields).toContainEqual({ name: 'Capacidad', value: 'Wireless carriers that support other eSIM activation methods' });
        });

        test('should detect removed carriers for Chile and notify', async () => {
            const initialESIMData = {
                'Chile': [
                    { name: 'CarrierToRemove', link: 'some-link', capability: 'Some Capability' },
                ]
            };
            fs.readJSON.mockResolvedValue(initialESIMData);
            await initialize();
            
            await check(mockClient);

            // 5 carriers are new, 1 is removed.
            expect(mockChannel.send).toHaveBeenCalledTimes(6);

            const sentEmbeds = mockChannel.send.mock.calls.map(call => call[0]);

            const removedEmbed = sentEmbeds.find(embed => embed.title.includes('eliminado'));
            expect(removedEmbed).toBeDefined();
            expect(removedEmbed.fields).toContainEqual({ name: 'Operador', value: '[CarrierToRemove](some-link)' });

            const addedEmbeds = sentEmbeds.filter(embed => embed.title.includes('agregado'));
            expect(addedEmbeds.length).toBe(5);
        });

        test('should not notify if no changes are detected', async () => {
            const initialESIMData = {
                "Chile": [
                    {
                        "name": "Claro",
                        "link": "https://www.clarochile.cl/personas/servicios/servicios-moviles/esim/",
                        "capability": "Wireless carriers that support other eSIM activation methods"
                    },
                    {
                        "name": "Entel",
                        "link": "https://ayuda.entel.cl/hc/es-419/articles/4406998318739--C%C3%B3mo-podr%C3%A1-adquirir-una-eSIM-",
                        "capability": "Wireless carriers that support other eSIM activation methods"
                    },
                    {
                        "name": "Movistar",
                        "link": "https://atencionalcliente.movistar.cl/telefonia-movil/como-funciona-la-esim/",
                        "capability": "Wireless carriers that support eSIM Quick Transfer"
                    },
                    {
                        "name": "Movistar",
                        "link": "https://atencionalcliente.movistar.cl/telefonia-movil/como-funciona-la-esim/",
                        "capability": "Wireless carriers that support other eSIM activation methods"
                    },
                    {
                        "name": "WOM",
                        "link": "https://www.wom.cl/centro-de-ayuda/quiero-la-esim-como-actualizo-mi-correo-electronico-para-recibir-el-qr-de-activacion/",
                        "capability": "Wireless carriers that support other eSIM activation methods"
                    }
                ]
            };

            fs.readJSON.mockResolvedValue(initialESIMData);
            await initialize();
            
            await check(mockClient);

            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(fs.outputJSON).not.toHaveBeenCalled();
        });
    });
});
