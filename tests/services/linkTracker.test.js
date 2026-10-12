const linkTracker = require('../../src/services/linkTracker');
const http = require('node:http');
const crypto = require('node:crypto');

jest.mock('../../src/storage', () => ({
    read: jest.fn().mockResolvedValue({ links: {} }),
    write: jest.fn().mockResolvedValue()
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
        linkTracker.activeLinks.clear();
        linkTracker.archivedLinks.clear();
        linkTracker.rateLimitMap.clear();
        linkTracker.recentClicksMap.clear();
        linkTracker.isLoaded = true;
        linkTracker.baseUrl = BASE_URL;
        if (linkTracker.server) {
            await linkTracker.stop();
        }
    });

    afterAll(async () => {
        await linkTracker.stop();
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

            // Add an archived link
            linkTracker.archivedLinks.set('arch0001', {
                targetUrl: 'https://paris.cl',
                productId: 'prod2',
                productName: 'MacBook Air',
                storeName: 'Paris',
                messageId: 'msg_old',
                offerPrice: 1100000,
                clicks: 20
            });

            const stats = linkTracker.getStats({ includeArchive: true });

            expect(stats.totalClicks).toBe(35);
            expect(stats.byProduct['prod1'].totalClicks).toBe(15);
            expect(stats.byProduct['prod1'].alerts['msg_1'].clicks).toBe(15);
            expect(stats.byProduct['prod2'].totalClicks).toBe(20);
            expect(stats.byStore['Falabella']).toBe(10);
            expect(stats.byStore['MacOnline']).toBe(5);
            expect(stats.byStore['Paris']).toBe(20);
            expect(stats.activeCount).toBe(2);
            expect(stats.archivedCount).toBe(1);
        });
    });

    describe('Archiving (_enforceActiveLimit)', () => {
        it('should move oldest links to archive when exceeding active threshold', () => {
            // Fill 5 dummy links with explicit timestamps
            for (let i = 1; i <= 5; i++) {
                const id = `0000000${i}`;
                linkTracker.activeLinks.set(id, {
                    targetUrl: `https://store.com/${i}`,
                    createdAt: new Date(2026, 0, i).toISOString(),
                    clicks: i
                });
            }

            // Exercise _enforceActiveLimit with custom threshold 3
            linkTracker._enforceActiveLimit(3);

            expect(linkTracker.activeLinks.size).toBe(3);
            expect(linkTracker.archivedLinks.size).toBe(2);
            expect(linkTracker.archivedLinks.has('00000001')).toBe(true);
            expect(linkTracker.archivedLinks.has('00000002')).toBe(true);
            expect(linkTracker.activeLinks.has('00000003')).toBe(true);
            expect(linkTracker.activeLinks.has('00000004')).toBe(true);
            expect(linkTracker.activeLinks.has('00000005')).toBe(true);
        });

        it('should purge excess archived links beyond retention limit', () => {
            for (let i = 1; i <= 5; i++) {
                const id = `0000000${i}`;
                linkTracker.archivedLinks.set(id, {
                    targetUrl: `https://store.com/${i}`,
                    archivedAt: new Date(2026, 0, i).toISOString(),
                    clicks: i
                });
            }

            linkTracker._enforceActiveLimit(100, 3);

            expect(linkTracker.archivedLinks.size).toBe(3);
            expect(linkTracker.archivedLinks.has('00000001')).toBe(false);
            expect(linkTracker.archivedLinks.has('00000002')).toBe(false);
            expect(linkTracker.archivedLinks.has('00000003')).toBe(true);
            expect(linkTracker.archivedLinks.has('00000004')).toBe(true);
            expect(linkTracker.archivedLinks.has('00000005')).toBe(true);
        });
    });

    describe('HTTP Redirect Server & Security', () => {
        beforeEach(async () => {
            await linkTracker.start({ port: TEST_PORT, baseUrl: BASE_URL });
        });

        afterEach(async () => {
            await linkTracker.stop();
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

        it('should return 302 Found redirect for an archived link without breaking', async () => {
            linkTracker.archivedLinks.set('11223344', {
                targetUrl: 'https://maconline.com/archived-deal',
                productId: 88,
                clicks: 5
            });

            const res = await request({
                hostname: TEST_HOST,
                port: TEST_PORT,
                path: '/r/11223344',
                method: 'GET'
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers['location']).toBe('https://maconline.com/archived-deal');
            expect(linkTracker.archivedLinks.get('11223344').clicks).toBe(6);
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

        it('should prioritize CF-Connecting-IP and X-Real-IP over X-Forwarded-For and socket when trustProxy is enabled', () => {
            linkTracker.trustProxy = true;
            const reqCf = {
                headers: {
                    'cf-connecting-ip': '203.0.113.195',
                    'x-real-ip': '198.51.100.10',
                    'x-forwarded-for': '192.0.2.1, 198.51.100.10'
                },
                socket: { remoteAddress: '172.18.0.5' }
            };
            expect(linkTracker.getClientIp(reqCf)).toBe('203.0.113.195');

            const reqNginx = {
                headers: {
                    'x-real-ip': '198.51.100.10',
                    'x-forwarded-for': '192.0.2.1, 198.51.100.10'
                },
                socket: { remoteAddress: '172.18.0.5' }
            };
            expect(linkTracker.getClientIp(reqNginx)).toBe('198.51.100.10');

            const reqForwarded = {
                headers: {
                    'x-forwarded-for': '192.0.2.1, 198.51.100.10'
                },
                socket: { remoteAddress: '172.18.0.5' }
            };
            expect(linkTracker.getClientIp(reqForwarded)).toBe('198.51.100.10');

            const reqIpv6Mapped = {
                headers: {
                    'cf-connecting-ip': '::ffff:203.0.113.195'
                },
                socket: { remoteAddress: '127.0.0.1' }
            };
            expect(linkTracker.getClientIp(reqIpv6Mapped)).toBe('203.0.113.195');

            // When trustProxy is disabled, ignores headers and uses socket IP
            linkTracker.trustProxy = false;
            expect(linkTracker.getClientIp(reqCf)).toBe('172.18.0.5');
            linkTracker.trustProxy = true;
        });
    });
});
