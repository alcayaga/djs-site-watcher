const linkTracker = require('../../src/services/linkTracker');
const http = require('node:http');
const crypto = require('node:crypto');
const storage = require('../../src/storage');
const logger = require('../../src/utils/logger');

jest.mock('../../src/storage', () => ({
    readEngagement: jest.fn().mockResolvedValue({ links: {} }),
    writeAtomic: jest.fn().mockResolvedValue()
}));

jest.mock('../../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

/**
 * Helper to make an HTTP request to the running linkTracker server.
 * @param {object} options HTTP request options.
 * @returns {Promise<{ statusCode: number, headers: object, body: string }>}
 */
function request(options) {
    return new Promise((resolve, reject) => {
        const reqOptions = {
            agent: false,
            ...options,
            headers: {
                Connection: 'close',
                ...(options.headers || {})
            }
        };
        const req = http.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

describe('LinkTracker Service', () => {
    const TEST_PORT = 39871;
    const TEST_HOST = '127.0.0.1';
    const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;

    beforeEach(async () => {
        jest.clearAllMocks();
        if (linkTracker.saveTimeout) {
            clearTimeout(linkTracker.saveTimeout);
            linkTracker.saveTimeout = null;
        }
        linkTracker.activeLinks.clear();
        linkTracker.rateLimitMap.clear();
        linkTracker.recentClicksMap.clear();
        linkTracker.activeOwners.clear();
        linkTracker.isLoaded = true;
        linkTracker.isDirty = false;
        linkTracker._warnedMissingForwardedHeader = false;
        linkTracker.baseUrl = BASE_URL;
        if (linkTracker.server) {
            await linkTracker.stop({ force: true });
        }
    });

    afterAll(async () => {
        await linkTracker.stop({ force: true });
    });

    describe('trackUrl', () => {
        it('should return targetUrl unchanged if baseUrl is not configured', () => {
            const result = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/item/1',
                productId: 123,
                baseUrl: ''
            });
            expect(result).toEqual({ url: 'https://falabella.com/item/1', id: null });
        });

        it('should return targetUrl unchanged if targetUrl has invalid protocol', () => {
            const result = linkTracker.trackUrl({
                targetUrl: 'javascript:alert(1)',
                productId: 123,
                baseUrl: BASE_URL
            });
            expect(result).toEqual({ url: 'javascript:alert(1)', id: null });
        });

        it('should generate an 8-character hex tracked URL and store record', () => {
            const result = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/item/1',
                productId: 12345,
                productName: 'iPhone 16 Pro',
                storeName: 'Falabella',
                baseUrl: BASE_URL
            });

            expect(result.id).toMatch(/^[a-f0-9]{8}$/);
            expect(result.url).toBe(`${BASE_URL}/r/${result.id}`);

            const record = linkTracker.activeLinks.get(result.id);
            expect(record).toBeDefined();
            expect(record.targetUrl).toBe('https://falabella.com/item/1');
            expect(record.productId).toBe('12345');
            expect(record.productName).toBe('iPhone 16 Pro');
            expect(record.storeName).toBe('Falabella');
            expect(record.clicks).toBe(0);
            expect(record.messageId).toBeNull();
        });

        it('should return null id and original targetUrl when ID generation fails after 10 collisions', () => {
            const cryptoSpy = jest.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from('ffffffff', 'hex'));
            linkTracker.activeLinks.set('ffffffff', { targetUrl: 'https://existing.com' });

            const result = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/item/1',
                productId: 123,
                baseUrl: BASE_URL
            });

            expect(result).toEqual({ url: 'https://falabella.com/item/1', id: null });
            cryptoSpy.mockRestore();
        });

        it('should return null id and original targetUrl when isLoaded is false', () => {
            linkTracker.isLoaded = false;
            const result = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/item/1',
                productId: 123,
                baseUrl: BASE_URL
            });

            expect(result).toEqual({ url: 'https://falabella.com/item/1', id: null });
            linkTracker.isLoaded = true;
        });
    });

    describe('untrack', () => {
        it('should remove specified active links', () => {
            const link1 = linkTracker.trackUrl({ targetUrl: 'https://store1.com', productId: 1, baseUrl: BASE_URL });
            const link2 = linkTracker.trackUrl({ targetUrl: 'https://store2.com', productId: 2, baseUrl: BASE_URL });

            expect(linkTracker.activeLinks.has(link1.id)).toBe(true);
            expect(linkTracker.activeLinks.has(link2.id)).toBe(true);

            linkTracker.untrack([link1.id, link2.id]);
            expect(linkTracker.activeLinks.has(link1.id)).toBe(false);
            expect(linkTracker.activeLinks.has(link2.id)).toBe(false);
        });

        it('should safely ignore null or non-string inputs', () => {
            expect(() => linkTracker.untrack(null)).not.toThrow();
            expect(() => linkTracker.untrack([123, null])).not.toThrow();
        });
    });

    describe('associateMessageId', () => {
        it('should associate messageId and price metadata with active links', () => {
            const link1 = linkTracker.trackUrl({
                targetUrl: 'https://store1.com',
                productId: 101,
                baseUrl: BASE_URL
            });
            const link2 = linkTracker.trackUrl({
                targetUrl: 'https://store2.com',
                productId: 101,
                baseUrl: BASE_URL
            });

            linkTracker.associateMessageId([link1.id, link2.id], 'msg_999', {
                offerPrice: 899990,
                normalPrice: 949990
            });

            const r1 = linkTracker.activeLinks.get(link1.id);
            const r2 = linkTracker.activeLinks.get(link2.id);

            expect(r1.messageId).toBe('msg_999');
            expect(r1.offerPrice).toBe(899990);
            expect(r2.messageId).toBe('msg_999');
            expect(r2.normalPrice).toBe(949990);
        });
    });

    describe('getStats', () => {
        it('should dynamically calculate rollups from active and archived links', () => {
            const link1 = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com',
                productId: 'prod1',
                productName: 'iPhone 16',
                storeName: 'Falabella',
                baseUrl: BASE_URL
            });
            const link2 = linkTracker.trackUrl({
                targetUrl: 'https://maconline.com',
                productId: 'prod1',
                productName: 'iPhone 16',
                storeName: 'MacOnline',
                baseUrl: BASE_URL
            });

            linkTracker.associateMessageId([link1.id, link2.id], 'msg_1', { offerPrice: 900000 });

            // Simulate clicks
            linkTracker.activeLinks.get(link1.id).clicks = 10;
            linkTracker.activeLinks.get(link2.id).clicks = 5;

            const stats = linkTracker.getStats();

            expect(stats.totalClicks).toBe(15);
            expect(stats.byProduct['prod1'].totalClicks).toBe(15);
            expect(stats.byProduct['prod1'].alerts['msg_1'].clicks).toBe(15);
            expect(stats.byStore['Falabella']).toBe(10);
            expect(stats.byStore['MacOnline']).toBe(5);
            expect(stats.activeCount).toBe(2);
        });
    });

    describe('Persistence & Error Recovery', () => {

        it('should mark isDirty on changes and only saveState on stop if isDirty or saveTimeout pending', async () => {
            expect(linkTracker.isDirty).toBe(false);

            // Modifying state sets isDirty
            linkTracker.trackUrl({ targetUrl: 'https://store.com/item', productId: 1 });
            expect(linkTracker.isDirty).toBe(true);

            // Calling saveState clears isDirty
            await linkTracker.saveState();
            expect(linkTracker.isDirty).toBe(false);

            // Stopping when not dirty does not call saveState
            const saveSpy = jest.spyOn(linkTracker, 'saveState');
            await linkTracker.stop({ force: true });
            expect(saveSpy).not.toHaveBeenCalled();
            saveSpy.mockRestore();
        });

        it('should flush mutations made during an in-progress save and serialize writes', async () => {
            let resolveFirstWrite;
            storage.writeAtomic
                .mockImplementationOnce(() => new Promise((resolve) => {
                    resolveFirstWrite = resolve;
                }))
                .mockResolvedValueOnce();

            linkTracker.trackUrl({ targetUrl: 'https://store.com/item1', productId: 1 });
            expect(linkTracker.isDirty).toBe(true);

            const savePromise = linkTracker.saveState();

            // Mutate state while saveState write is in flight
            linkTracker.trackUrl({ targetUrl: 'https://store.com/item2', productId: 2 });
            expect(linkTracker.isDirty).toBe(true);

            // Complete first storage write
            resolveFirstWrite();
            await savePromise;

            // Second write flushed item2, state is marked clean
            expect(storage.writeAtomic).toHaveBeenCalledTimes(2);
            expect(linkTracker.isDirty).toBe(false);
        });

        it('should restore isDirty to true if storage write fails', async () => {
            storage.writeAtomic.mockRejectedValueOnce(new Error('Disk write error'));

            linkTracker.trackUrl({ targetUrl: 'https://store.com/item1', productId: 1 });
            expect(linkTracker.isDirty).toBe(true);

            await expect(linkTracker.saveState()).rejects.toThrow('Disk write error');
            expect(linkTracker.isDirty).toBe(true);
        });

        it('should load empty state when engagement file is missing', async () => {
            linkTracker.isLoaded = false;
            storage.readEngagement.mockResolvedValueOnce({});

            await linkTracker.loadState();
            expect(linkTracker.isLoaded).toBe(true);
            expect(linkTracker.activeLinks.size).toBe(0);
            expect(storage.readEngagement).toHaveBeenCalledTimes(1);
        });

        it('should propagate read errors other than ENOENT and leave isLoaded false', async () => {
            linkTracker.isLoaded = false;
            const corruptErr = new Error('Corrupt JSON: Unexpected token');
            storage.readEngagement.mockRejectedValueOnce(corruptErr);

            await expect(linkTracker.loadState()).rejects.toThrow('Corrupt JSON: Unexpected token');
            expect(linkTracker.isLoaded).toBe(false);
        });
    });

    describe('HTTP Redirect Server & Security', () => {
        beforeEach(async () => {
            await linkTracker.start({ port: TEST_PORT, baseUrl: BASE_URL });
        });

        afterEach(async () => {
            await linkTracker.stop({ force: true });
        });

        it('should respond with 200 OK on /health with security headers', async () => {
            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/health',
                method: 'GET'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body).toBe('OK');
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['x-frame-options']).toBe('DENY');
            expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
        });

        it('should return 302 Found redirect for a valid active link and increment click', async () => {
            const link = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/oferta/iphone',
                productId: 99,
                baseUrl: BASE_URL
            });

            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: `/r/${link.id}`,
                method: 'GET'
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers['location']).toBe('https://falabella.com/oferta/iphone');
            expect(res.headers['cache-control']).toContain('no-store');

            const record = linkTracker.activeLinks.get(link.id);
            expect(record.clicks).toBe(1);
            expect(record.lastClicked).toBeDefined();
        });

        it('should deduplicate rapid consecutive clicks from the same IP within 10s', async () => {
            const link = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/oferta/dedup',
                productId: 99,
                baseUrl: BASE_URL
            });

            // First click
            const res1 = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: `/r/${link.id}`,
                method: 'GET'
            });
            expect(res1.statusCode).toBe(302);

            // Immediate second click (same client IP)
            const res2 = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: `/r/${link.id}`,
                method: 'GET'
            });
            expect(res2.statusCode).toBe(302);

            // Click count should be 1, not 2
            const record = linkTracker.activeLinks.get(link.id);
            expect(record.clicks).toBe(1);
        });

        it('should reject non-GET/HEAD methods with 405 Method Not Allowed', async () => {
            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/r/12345678',
                method: 'POST'
            });

            expect(res.statusCode).toBe(405);
            expect(res.headers['allow']).toBe('GET, HEAD');
        });

        it('should return 404 for invalid link ID format (path traversal, non-hex, length != 8)', async () => {
            const res1 = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/r/../secret',
                method: 'GET'
            });
            expect(res1.statusCode).toBe(404);

            const res2 = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/r/123', // Too short
                method: 'GET'
            });
            expect(res2.statusCode).toBe(404);

            const res3 = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/r/nonhex00', // Non-hex chars
                method: 'GET'
            });
            expect(res3.statusCode).toBe(404);
        });

        it('should return 404 for unknown link ID', async () => {
            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/r/deadbeef',
                method: 'GET'
            });
            expect(res.statusCode).toBe(404);
        });

        it('should return 429 Too Many Requests when IP rate limit is exceeded', async () => {
            linkTracker.rateLimitMap.set('127.0.0.1', {
                count: 61,
                resetTime: Date.now() + 60000
            });
            linkTracker.rateLimitMap.set('::1', {
                count: 61,
                resetTime: Date.now() + 60000
            });

            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/health',
                method: 'GET'
            });

            expect(res.statusCode).toBe(429);
            expect(res.headers['retry-after']).toBe('60');
        });

        it('should use rightmost X-Forwarded-For when trustProxy is enabled without explicit trustedHeader', () => {
            linkTracker.trustProxy = true;
            linkTracker.trustedHeader = null;

            const reqForwarded = {
                headers: {
                    'x-forwarded-for': '192.0.2.1, 198.51.100.10'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(reqForwarded)).toBe('198.51.100.10');

            // Headers like cf-connecting-ip or x-real-ip are ignored in default path without trustedHeader
            const reqUntrustedHeaders = {
                headers: {
                    'cf-connecting-ip': '203.0.113.195',
                    'x-real-ip': '203.0.113.196',
                    'x-forwarded-for': '192.0.2.1, 198.51.100.10'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(reqUntrustedHeaders)).toBe('198.51.100.10');

            // IPv6 mapped in X-Forwarded-For
            const reqIpv6Mapped = {
                headers: {
                    'x-forwarded-for': '::ffff:198.51.100.10'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(reqIpv6Mapped)).toBe('198.51.100.10');

            // When socket remoteAddress is an untrusted public or non-loopback IP, X-Forwarded-For is ignored
            const reqDirectUntrusted = {
                headers: {
                    'x-forwarded-for': '198.51.100.10'
                },
                socket: { remoteAddress: '203.0.113.50' }
            };
            expect(linkTracker.getClientIp(reqDirectUntrusted)).toBe('203.0.113.50');

            const reqPrivateUntrusted = {
                headers: {
                    'x-forwarded-for': '198.51.100.10'
                },
                socket: { remoteAddress: '172.18.0.5' }
            };
            expect(linkTracker.getClientIp(reqPrivateUntrusted)).toBe('172.18.0.5');

            // When trustProxy is disabled, ignores headers and uses socket IP
            linkTracker.trustProxy = false;
            expect(linkTracker.getClientIp(reqUntrustedHeaders)).toBe('127.0.0.1');
            linkTracker.trustProxy = true;
        });

        it('should log a warning once when trusted proxy socket has no usable forwarded header', () => {
            linkTracker.trustProxy = true;
            linkTracker.trustedHeader = null;
            linkTracker._warnedMissingForwardedHeader = false;

            const reqMissing = {
                headers: {},
                socket: { remoteAddress: '127.0.0.1' }
            };

            const ip1 = linkTracker.getClientIp(reqMissing);
            expect(ip1).toBe('127.0.0.1');
            expect(logger.warn).toHaveBeenCalledWith(
                '[LinkTracker] Request from trusted proxy is missing expected forwarded IP header; falling back to socket address.'
            );

            logger.warn.mockClear();

            // Second request: warning should not be logged again
            const ip2 = linkTracker.getClientIp(reqMissing);
            expect(ip2).toBe('127.0.0.1');
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should not change serverPort if start is called again while server is running', async () => {
            expect(linkTracker.serverPort).toBe(TEST_PORT);
            await linkTracker.start({ port: 9999 });
            expect(linkTracker.serverPort).toBe(TEST_PORT);
        });

        it('should preserve running settings and log warnings when start is called with conflicting options', async () => {
            const initialBaseUrl = linkTracker.baseUrl;
            const initialTrustProxy = linkTracker.trustProxy;
            const initialTrustedHeader = linkTracker.trustedHeader;

            await linkTracker.start({
                baseUrl: 'https://conflicting.example.com',
                trustProxy: !initialTrustProxy,
                trustedHeader: 'x-conflicting-header',
                owner: 'SecondCaller'
            });

            // Settings must not be mutated
            expect(linkTracker.baseUrl).toBe(initialBaseUrl);
            expect(linkTracker.trustProxy).toBe(initialTrustProxy);
            expect(linkTracker.trustedHeader).toBe(initialTrustedHeader);
            expect(linkTracker.activeOwners.has('SecondCaller')).toBe(true);

            // Warnings logged for conflicts
            expect(logger.warn).toHaveBeenCalledWith(
                '[LinkTracker] Server already running; ignoring conflicting baseUrl.'
            );
        });

        it('should strictly use only trustedHeader when configured, ignoring other forwarded headers', () => {
            linkTracker.trustProxy = true;
            linkTracker.trustedHeader = 'cf-connecting-ip';

            // Spoofed headers should NOT be picked up if cf-connecting-ip is missing
            const spoofedReq = {
                headers: {
                    'x-real-ip': '1.2.3.4',
                    'x-forwarded-for': '5.6.7.8'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(spoofedReq)).toBe('127.0.0.1');

            // Legitimate cf-connecting-ip header should be extracted
            const legitimateReq = {
                headers: {
                    'cf-connecting-ip': '203.0.113.50',
                    'x-real-ip': '1.2.3.4',
                    'x-forwarded-for': '5.6.7.8'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(legitimateReq)).toBe('203.0.113.50');

            // Handle comma-separated list in trusted header taking rightmost
            const commaReq = {
                headers: {
                    'cf-connecting-ip': '198.51.100.1, 203.0.113.60'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(commaReq)).toBe('203.0.113.60');

            // When connecting from an untrusted public socket, trustedHeader is ignored to prevent spoofing
            const directUntrustedReq = {
                headers: {
                    'cf-connecting-ip': '203.0.113.50'
                },
                socket: { remoteAddress: '198.51.100.99' }
            };
            expect(linkTracker.getClientIp(directUntrustedReq)).toBe('198.51.100.99');

            linkTracker.trustedHeader = null;
        });

        it('should manage owner ref-counting across start and stop calls', async () => {
            const OWNER_PORT = 39872;
            const OWNER_BASE = `http://127.0.0.1:${OWNER_PORT}`;

            await linkTracker.start({ port: OWNER_PORT, baseUrl: OWNER_BASE, owner: 'Monitor1' });
            expect(linkTracker.isRunning()).toBe(true);
            expect(linkTracker.activeOwners.has('Monitor1')).toBe(true);

            // Register second owner
            await linkTracker.start({ port: OWNER_PORT, baseUrl: OWNER_BASE, owner: 'Monitor2' });
            expect(linkTracker.activeOwners.has('Monitor2')).toBe(true);
            expect(linkTracker.activeOwners.size).toBe(2);

            // Stop first owner: server must still be running
            await linkTracker.stop({ owner: 'Monitor1' });
            expect(linkTracker.isRunning()).toBe(true);
            expect(linkTracker.activeOwners.has('Monitor1')).toBe(false);
            expect(linkTracker.activeOwners.has('Monitor2')).toBe(true);

            // Stop second owner: server shuts down
            await linkTracker.stop({ owner: 'Monitor2' });
            expect(linkTracker.isRunning()).toBe(false);
            expect(linkTracker.activeOwners.size).toBe(0);

            // Restart with owner and test force stop
            await linkTracker.start({ port: OWNER_PORT, baseUrl: OWNER_BASE, owner: 'Monitor1' });
            expect(linkTracker.isRunning()).toBe(true);
            await linkTracker.stop({ force: true });
            expect(linkTracker.isRunning()).toBe(false);
            expect(linkTracker.activeOwners.size).toBe(0);
        });

        it('should cleanly shut down when stop() is called while start() is awaiting loadState', async () => {
            await linkTracker.stop({ force: true });
            linkTracker.isLoaded = false;
            let resolveLoad;
            storage.readEngagement.mockImplementationOnce(() => new Promise((resolve) => {
                resolveLoad = resolve;
            }));

            // Initiate start (will pause inside loadState)
            const startPromise = linkTracker.start({ port: TEST_PORT, baseUrl: BASE_URL, owner: 'SlowLoad' });

            // Call stop while start is pending
            const stopPromise = linkTracker.stop({ force: true });

            // Complete the loadState read
            resolveLoad({ links: {} });

            await Promise.all([startPromise, stopPromise]);

            expect(linkTracker.isRunning()).toBe(false);
            expect(linkTracker.activeOwners.size).toBe(0);
        });

        it('should handle synchronous listen errors and clean up state', async () => {
            await linkTracker.stop({ force: true });
            const createServerSpy = jest.spyOn(http, 'createServer').mockReturnValueOnce({
                on: jest.fn(),
                once: jest.fn(),
                removeListener: jest.fn(),
                listen: jest.fn().mockImplementation(() => {
                    throw new Error('Sync listen failure');
                })
            });

            await expect(linkTracker.start({ port: TEST_PORT, baseUrl: BASE_URL, owner: 'Test' }))
                .rejects.toThrow('Sync listen failure');
            expect(linkTracker.isRunning()).toBe(false);
            expect(linkTracker.activeOwners.has('Test')).toBe(false);

            createServerSpy.mockRestore();
        });

        it('should redirect using targetParsed.href with encoded special characters', async () => {
            const rawTargetUrl = 'https://example.com/producto/café-y-té?query=áéí';
            const link = linkTracker.trackUrl({
                targetUrl: rawTargetUrl,
                productId: 77,
                baseUrl: BASE_URL
            });

            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: `/r/${link.id}`,
                method: 'GET'
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers['location']).toBe(new URL(rawTargetUrl).href);
        });

        it('should handle HEAD requests on redirect without incrementing clicks or sending body', async () => {
            const link = linkTracker.trackUrl({
                targetUrl: 'https://falabella.com/oferta/head-test',
                productId: 101,
                baseUrl: BASE_URL
            });

            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: `/r/${link.id}`,
                method: 'HEAD'
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers['location']).toBe('https://falabella.com/oferta/head-test');
            expect(res.body).toBe('');

            const record = linkTracker.activeLinks.get(link.id);
            expect(record.clicks || 0).toBe(0);
        });

        it('should handle HEAD requests on /health without sending body', async () => {
            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/health',
                method: 'HEAD'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body).toBe('');
        });

        it('should default host to 127.0.0.1 when trustProxy is true', async () => {
            await linkTracker.stop({ force: true });
            await linkTracker.start({ port: TEST_PORT, baseUrl: BASE_URL, trustProxy: true });

            expect(linkTracker.serverHost).toBe('127.0.0.1');
            await linkTracker.stop({ force: true });
        });

        it('should default host to 0.0.0.0 when trustProxy is false', async () => {
            await linkTracker.stop({ force: true });
            await linkTracker.start({ port: TEST_PORT, baseUrl: BASE_URL, trustProxy: false });

            expect(linkTracker.serverHost).toBe('0.0.0.0');
            await linkTracker.stop({ force: true });
        });
    });
});

