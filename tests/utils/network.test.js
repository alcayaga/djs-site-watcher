describe('Network Utils', () => {
    const promisifiedDnsLookup = (options, hostname, lookupOpts = {}) => {
        return new Promise((resolve, reject) => {
            options.dnsLookup(hostname, lookupOpts, (err, address, family) => {
                if (err) return reject(err);
                resolve({ address, family });
            });
        });
    };

    describe('getSafeGotOptions', () => {
        describe('with bypass inactive (default)', () => {
            let getSafeGotOptions;
            beforeAll(() => {
                jest.resetModules();
                jest.doMock('../../src/config', () => ({ ALLOW_PRIVATE_IPS: false }));
                getSafeGotOptions = require('../../src/utils/network').getSafeGotOptions;
            });

            it('should return default timeout and retry options', () => {
                const options = getSafeGotOptions();
                expect(options.timeout.request).toBe(10000);
                expect(options.retry.limit).toBe(2);
                expect(typeof options.dnsLookup).toBe('function');
                expect(options.hooks.beforeRequest).toHaveLength(1);
            });

            it('should block private IPs in beforeRequest hook', () => {
                const options = getSafeGotOptions();
                const beforeRequest = options.hooks.beforeRequest[0];
                const mockOptions = (hostname) => ({ url: { hostname } });

                expect(() => beforeRequest(mockOptions('127.0.0.1'))).toThrow('SSRF Prevention');
                expect(() => beforeRequest(mockOptions('10.0.0.1'))).toThrow('SSRF Prevention');
                expect(() => beforeRequest(mockOptions('google.com'))).not.toThrow();
            });

            describe('dnsLookup', () => {
                const dns = require('dns');

                it('should allow valid public addresses', async () => {
                    const options = getSafeGotOptions();
                    jest.spyOn(dns, 'lookup').mockImplementation((hostname, opts, cb) => {
                        cb(null, '93.184.216.34', 4);
                    });

                    const { address, family } = await promisifiedDnsLookup(options, 'example.com');
                    expect(address).toBe('93.184.216.34');
                    expect(family).toBe(4);
                });

                it('should block private addresses', async () => {
                    const options = getSafeGotOptions();
                    jest.spyOn(dns, 'lookup').mockImplementation((hostname, opts, cb) => {
                        cb(null, '127.0.0.1', 4);
                    });

                    await expect(promisifiedDnsLookup(options, 'localhost'))
                        .rejects.toThrow('SSRF Prevention');
                });

                it('should block if any address in multi-IP result is private', async () => {
                    const options = getSafeGotOptions();
                    jest.spyOn(dns, 'lookup').mockImplementation((hostname, opts, cb) => {
                        cb(null, [
                            { address: '93.184.216.34', family: 4 },
                            { address: '127.0.0.1', family: 4 }
                        ]);
                    });

                    await expect(promisifiedDnsLookup(options, 'mixed.com'))
                        .rejects.toThrow('SSRF Prevention');
                });

                it('should allow multi-IP result if all are public', async () => {
                    const options = getSafeGotOptions();
                    const results = [
                        { address: '93.184.216.34', family: 4 },
                        { address: '1.1.1.1', family: 4 }
                    ];
                    jest.spyOn(dns, 'lookup').mockImplementation((hostname, opts, cb) => {
                        cb(null, results);
                    });

                    const { address } = await promisifiedDnsLookup(options, 'public.com');
                    expect(address).toEqual(results);
                });
            });
        });

        describe('with bypass active', () => {
            let getSafeGotOptions;
            beforeAll(() => {
                jest.resetModules();
                jest.doMock('../../src/config', () => ({ ALLOW_PRIVATE_IPS: true }));
                getSafeGotOptions = require('../../src/utils/network').getSafeGotOptions;
            });

            it('should allow private IPs in beforeRequest hook', () => {
                const options = getSafeGotOptions();
                const beforeRequest = options.hooks.beforeRequest[0];
                const mockOptions = (hostname) => ({ url: { hostname } });

                expect(() => beforeRequest(mockOptions('127.0.0.1'))).not.toThrow();
            });

            describe('dnsLookup', () => {
                const dns = require('dns');

                it('should allow private addresses', async () => {
                    const options = getSafeGotOptions();
                    jest.spyOn(dns, 'lookup').mockImplementation((hostname, opts, cb) => {
                        cb(null, '127.0.0.1', 4);
                    });

                    const { address } = await promisifiedDnsLookup(options, 'localhost');
                    expect(address).toBe('127.0.0.1');
                });
            });
        });
    });

    describe('isPrivateIP', () => {
        describe('with bypass active', () => {
            let isPrivateIP;
            beforeAll(() => {
                jest.resetModules();
                jest.doMock('../../src/config', () => ({
                    ALLOW_PRIVATE_IPS: true
                }));
                isPrivateIP = require('../../src/utils/network').isPrivateIP;
            });

            it('should return false for private IPs', () => {
                expect(isPrivateIP('127.0.0.1')).toBe(false);
            });
        });

        describe('with bypass inactive', () => {
            let isPrivateIP;
            beforeAll(() => {
                jest.resetModules();
                jest.doMock('../../src/config', () => ({
                    ALLOW_PRIVATE_IPS: false
                }));
                isPrivateIP = require('../../src/utils/network').isPrivateIP;
            });

            it('should return true for private IPv4 addresses', () => {
                expect(isPrivateIP('127.0.0.1')).toBe(true);
                expect(isPrivateIP('10.0.0.1')).toBe(true);
                expect(isPrivateIP('192.168.1.1')).toBe(true);
                expect(isPrivateIP('172.16.0.1')).toBe(true); // 172.16.x.x is private
                expect(isPrivateIP('172.31.255.255')).toBe(true); // 172.31.x.x is private
                expect(isPrivateIP('169.254.1.1')).toBe(true);
            });

            it('should return true for private IPv6 addresses', () => {
                expect(isPrivateIP('::1')).toBe(true);
                expect(isPrivateIP('fc00::1')).toBe(true);
                expect(isPrivateIP('fd00::1')).toBe(true);
                expect(isPrivateIP('fe80::1')).toBe(true);
            });

            it('should return false for public IPv4 addresses', () => {
                expect(isPrivateIP('8.8.8.8')).toBe(false);
                expect(isPrivateIP('1.1.1.1')).toBe(false);
                expect(isPrivateIP('172.32.0.1')).toBe(false); // Outside 172.16.0.0/12 range
            });
            
            it('should return false for public IPv6 addresses', () => {
                expect(isPrivateIP('2606:4700:4700::1111')).toBe(false); // Cloudflare
            });
        });
    });
});