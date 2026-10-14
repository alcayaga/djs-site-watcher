const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');
const storage = require('../storage');
const logger = require('../utils/logger');
const {
    DEAL_ENGAGEMENT_FILE,
    DEFAULT_TRACKING_PORT
} = require('../utils/constants');

const loopbackList = new net.BlockList();
loopbackList.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackList.addAddress('::1', 'ipv6');

/**
 * Checks whether an IP address belongs to a trusted loopback reverse proxy.
 * @param {string} ip The IP address to check.
 * @returns {boolean} True if the IP is loopback.
 */
function isTrustedProxySocket(ip) {
    if (!ip) return false;
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const family = net.isIP(normalized);
    if (!family) return false;
    return loopbackList.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per IP
const CLICK_DEDUP_WINDOW_MS = 10 * 1000; // 10 seconds cooldown per IP per link
const DEBOUNCE_SAVE_MS = 1500; // 1.5 seconds

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer-when-downgrade',
    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
};

/**
 * Service to manage redirect link generation, security-hardened HTTP redirects,
 * and engagement analytics for DealMonitor links.
 */
class LinkTracker {
    /**
     * Creates an instance of LinkTracker.
     */
    constructor() {
        /**
         * Map of active redirect links keyed by short ID.
         * Links are preserved indefinitely without eviction so existing Discord alerts
         * remain valid. Unbounded growth is mitigated by debounced serialization (see scheduleSave)
         * and planned migration to SQLite (Issue #236).
         * @type {Map<string, Object>}
         */
        this.activeLinks = new Map();
        this.server = null;
        this.serverPort = null;
        this.serverHost = null;
        this.baseUrl = null;
        this.isLoaded = false;
        this._loadPromise = null;
        this._startPromise = null;
        this._startupOwners = null;
        this._savingPromise = null;
        this._needsSaveAgain = false;
        this.trustProxy = false;
        this.trustedHeader = null;
        this.activeOwners = new Set();
        this.saveTimeout = null;
        this.isDirty = false;
        this.rateLimitMap = new Map();
        this.recentClicksMap = new Map();
        this._cleanupInterval = null;
        this._warnedMissingForwardedHeader = false;
    }

    /**
     * Extracts and validates the client IP from the request.
     * Respects reverse proxy headers when trustProxy is enabled.
     * If trustedHeader is configured, only inspects that header.
     * @param {import('node:http').IncomingMessage} req The HTTP request.
     * @returns {string} The resolved client IP.
     */
    getClientIp(req) {
        let socketIp = req.socket?.remoteAddress;
        if (socketIp) {
            if (socketIp.startsWith('::ffff:')) {
                socketIp = socketIp.slice(7);
            }
        }

        // If proxy trusting is disabled, only use direct TCP socket IP
        if (!this.trustProxy) {
            return (socketIp && net.isIP(socketIp)) ? socketIp : '127.0.0.1';
        }

        // If a specific trustedHeader is configured, only inspect that header from a trusted proxy socket
        if (this.trustedHeader) {
            if (isTrustedProxySocket(socketIp)) {
                const rawHeader = req.headers[this.trustedHeader];
                const headerVal = Array.isArray(rawHeader)
                    ? rawHeader[rawHeader.length - 1]
                    : rawHeader;

                if (typeof headerVal === 'string' && headerVal.length > 0) {
                    const parts = headerVal.split(',');
                    let headerIp = parts[parts.length - 1].trim();
                    if (headerIp.startsWith('::ffff:')) {
                        headerIp = headerIp.slice(7);
                    }
                    if (net.isIP(headerIp)) {
                        return headerIp;
                    }
                }

                if (!this._warnedMissingForwardedHeader) {
                    this._warnedMissingForwardedHeader = true;
                    logger.warn('[LinkTracker] Request from trusted proxy is missing expected forwarded IP header; falling back to socket address.');
                }
            }

            // Fallback to socket IP when trusted header is absent or invalid
            if (socketIp && net.isIP(socketIp)) {
                return socketIp;
            }
            return '127.0.0.1';
        }

        // Default path when trustProxy is enabled without an explicit trustedHeader:
        // Use the rightmost entry of X-Forwarded-For appended by the trusted single-hop reverse proxy.
        // Only accept forwarded addresses when the connecting socket peer is a trusted local/private proxy,
        // preventing direct untrusted clients from supplying spoofed headers.
        if (isTrustedProxySocket(socketIp)) {
            const xForwardedFor = req.headers['x-forwarded-for'];
            const forwardedVal = Array.isArray(xForwardedFor)
                ? xForwardedFor[xForwardedFor.length - 1]
                : xForwardedFor;

            if (typeof forwardedVal === 'string' && forwardedVal.length > 0) {
                const parts = forwardedVal.split(',');
                let trustedIp = parts[parts.length - 1].trim();
                if (trustedIp.startsWith('::ffff:')) {
                    trustedIp = trustedIp.slice(7);
                }
                if (net.isIP(trustedIp)) {
                    return trustedIp;
                }
            }

            if (!this._warnedMissingForwardedHeader) {
                this._warnedMissingForwardedHeader = true;
                logger.warn('[LinkTracker] Request from trusted proxy is missing expected forwarded IP header; falling back to socket address.');
            }
        }

        // Fallback to direct TCP socket address
        if (socketIp && net.isIP(socketIp)) {
            return socketIp;
        }
        return '127.0.0.1';
    }

    /**
     * Checks if a client IP has exceeded the rate limit.
     * @param {string} ip The client IP.
     * @returns {boolean} True if the request should be blocked.
     */
    isRateLimited(ip) {
        const now = Date.now();
        const entry = this.rateLimitMap.get(ip);
        if (!entry || now > entry.resetTime) {
            this.rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
            return false;
        }
        entry.count++;
        return entry.count > RATE_LIMIT_MAX_REQUESTS;
    }

    /**
     * Periodic cleanup for rate limit and click deduplication maps to prevent memory leaks.
     * @private
     */
    _cleanupMemoryMaps() {
        const now = Date.now();
        for (const [ip, entry] of this.rateLimitMap.entries()) {
            if (now > entry.resetTime) {
                this.rateLimitMap.delete(ip);
            }
        }
        for (const [key, timestamp] of this.recentClicksMap.entries()) {
            if (now - timestamp > CLICK_DEDUP_WINDOW_MS * 2) {
                this.recentClicksMap.delete(key);
            }
        }
    }

    /**
     * Loads link engagement state from storage.
     * @returns {Promise<void>}
     */
    async loadState() {
        if (this.isLoaded) return;
        if (this._loadPromise) return this._loadPromise;

        this._loadPromise = (async () => {
            try {
                const data = await storage.readEngagement(DEAL_ENGAGEMENT_FILE);
                if (data && typeof data.links === 'object' && data.links !== null) {
                    for (const [id, record] of Object.entries(data.links)) {
                        if (id && typeof record === 'object' && record !== null) {
                            if (!this.activeLinks.has(id)) {
                                this.activeLinks.set(id, record);
                            }
                        }
                    }
                }

                this.isLoaded = true;
                logger.info('[LinkTracker] Loaded %d tracked links.', this.activeLinks.size);
            } catch (error) {
                logger.error('[LinkTracker] Failed to load link engagement state:', error);
                this.isLoaded = false;
                throw error;
            } finally {
                this._loadPromise = null;
            }
        })();

        return this._loadPromise;
    }

    /**
     * Schedules a debounced atomic write to disk.
     * Collapses high-frequency click tracking events within a 1.5s window
     * into a single atomic write to minimize disk I/O on sustained traffic.
     */
    scheduleSave() {
        this.isDirty = true;
        if (this.saveTimeout) return;
        this.saveTimeout = setTimeout(() => {
            this.saveTimeout = null;
            this.saveState().catch(err => {
                logger.error('[LinkTracker] Error saving link engagement state:', err);
            });
        }, DEBOUNCE_SAVE_MS);
        if (typeof this.saveTimeout.unref === 'function') {
            this.saveTimeout.unref();
        }
    }

    /**
     * Flushes active links to storage as a single atomic snapshot.
     * All tracked links are preserved indefinitely without eviction to guarantee
     * historical redirect availability. Concurrent saves are serialized and queued
     * if state becomes dirty during an in-flight write.
     * Persistent indexing and database storage migration are tracked in Issue #236.
     * @returns {Promise<void>}
     */
    async saveState() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }

        if (this._loadPromise) {
            await this._loadPromise.catch(() => {});
        } else if (!this.isLoaded) {
            await this.loadState().catch(() => {});
        }

        if (!this.isLoaded) {
            logger.warn('[LinkTracker] Skipping saveState: state is not loaded.');
            return;
        }

        if (this._savingPromise) {
            this._needsSaveAgain = true;
            return this._savingPromise;
        }

        this._savingPromise = (async () => {
            do {
                this._needsSaveAgain = false;
                this.isDirty = false;

                const snapshot = {
                    links: Object.fromEntries(this.activeLinks)
                };

                try {
                    await storage.writeAtomic(DEAL_ENGAGEMENT_FILE, snapshot);
                } catch (err) {
                    this.isDirty = true;
                    throw err;
                }
            } while (this._needsSaveAgain || this.isDirty);
        })().finally(() => {
            this._savingPromise = null;
        });

        return this._savingPromise;
    }

    /**
     * Generates a tracked redirect URL for an outbound deal link.
     * If tracking is disabled or targetUrl is invalid, returns the targetUrl untouched.
     * 
     * @param {object} params
     * @param {string} params.targetUrl The original destination URL.
     * @param {string|number} params.productId The Solotodo product ID.
     * @param {string} [params.productName] The product name.
     * @param {string} [params.storeName] The merchant store name.
     * @param {string} [params.baseUrl] The base URL for tracking redirects (from monitor config).
     * @returns {{ url: string, id: string|null }} The resulting URL and link ID.
     */
    trackUrl({ targetUrl, productId, productName, storeName, baseUrl } = {}) {
        const effectiveBaseUrl = (baseUrl !== undefined && baseUrl !== null) ? baseUrl : this.baseUrl;
        if (!effectiveBaseUrl || typeof targetUrl !== 'string' || !targetUrl) {
            return { url: targetUrl, id: null };
        }

        // Validate destination URL protocol
        try {
            const parsed = new URL(targetUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return { url: targetUrl, id: null };
            }
        } catch {
            return { url: targetUrl, id: null };
        }

        if (!this.isLoaded) {
            return { url: targetUrl, id: null };
        }

        // Generate unique 8-character hex ID
        let id;
        let attempts = 0;
        do {
            id = crypto.randomBytes(4).toString('hex');
            attempts++;
        } while (this.activeLinks.has(id) && attempts < 10);

        if (this.activeLinks.has(id)) {
            logger.error('[LinkTracker] Failed to generate a unique link ID after 10 attempts.');
            return { url: targetUrl, id: null };
        }

        const record = {
            targetUrl,
            productId: String(productId || ''),
            productName: String(productName || ''),
            storeName: String(storeName || 'Tienda'),
            messageId: null,
            offerPrice: null,
            normalPrice: null,
            createdAt: new Date().toISOString(),
            clicks: 0,
            lastClicked: null
        };

        this.activeLinks.set(id, record);
        this.scheduleSave();

        const sanitizedBase = effectiveBaseUrl.replace(/\/+$/, '');
        return {
            url: `${sanitizedBase}/r/${id}`,
            id
        };
    }

    /**
     * Removes tracked link records by IDs (e.g. if sending Discord message fails).
     * @param {string|string[]} ids Link ID or list of IDs.
     */
    untrack(ids) {
        if (!ids) return;
        const list = Array.isArray(ids) ? ids : [ids];
        let deletedAny = false;
        for (const id of list) {
            if (typeof id === 'string' && this.activeLinks.delete(id)) {
                deletedAny = true;
            }
        }
        if (deletedAny) {
            this.scheduleSave();
        }
    }

    /**
     * Associates Discord message ID and pricing metadata with generated link IDs.
     * @param {Array<string>} linkIds The generated link IDs.
     * @param {string} messageId The published Discord message ID.
     * @param {object} [metadata] Optional price and timestamp metadata.
     */
    associateMessageId(linkIds, messageId, metadata = {}) {
        if (!Array.isArray(linkIds) || !messageId) return;

        let modified = false;
        for (const id of linkIds) {
            if (!id || typeof id !== 'string') continue;
            let record = this.activeLinks.get(id);
            if (record) {
                record.messageId = String(messageId);
                if (metadata.offerPrice !== undefined) record.offerPrice = metadata.offerPrice;
                if (metadata.normalPrice !== undefined) record.normalPrice = metadata.normalPrice;
                modified = true;
            }
        }

        if (modified) {
            this.scheduleSave();
        }
    }

    /**
     * Dynamically computes aggregated metrics from tracked links.
     * @returns {object} Derived analytics data.
     */
    getStats() {
        let totalClicks = 0;
        const byProduct = {};
        const byStore = {};

        /**
          * Accumulates metrics from a link record into rollups.
          * @param {object} record The link record.
          */
        const processRecord = (record) => {
            const clicks = record.clicks || 0;
            totalClicks += clicks;

            // Product Rollup
            const pId = record.productId || 'unknown';
            if (!byProduct[pId]) {
                byProduct[pId] = {
                    name: record.productName || '',
                    totalClicks: 0,
                    alerts: {}
                };
            }
            byProduct[pId].totalClicks += clicks;

            if (record.messageId) {
                const mId = record.messageId;
                if (!byProduct[pId].alerts[mId]) {
                    byProduct[pId].alerts[mId] = {
                        clicks: 0,
                        offerPrice: record.offerPrice,
                        normalPrice: record.normalPrice
                    };
                }
                byProduct[pId].alerts[mId].clicks += clicks;
            }

            // Store Rollup
            const sName = record.storeName || 'Tienda';
            byStore[sName] = (byStore[sName] || 0) + clicks;
        };

        for (const record of this.activeLinks.values()) {
            processRecord(record);
        }

        return {
            totalClicks,
            byProduct,
            byStore,
            activeCount: this.activeLinks.size,
            trackedCount: this.activeLinks.size
        };
    }

    /**
     * Handles an incoming HTTP request on the redirect server.
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:http').ServerResponse} res
     */
    async handleRequest(req, res) {
        // Enforce strict HTTP method whitelist (GET and HEAD only)
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, {
                'Allow': 'GET, HEAD',
                'Content-Type': 'text/plain; charset=utf-8',
                ...SECURITY_HEADERS
            });
            res.end('Method Not Allowed');
            return;
        }

        // Prevent body buffering
        req.resume();

        let parsedUrl;
        try {
            parsedUrl = new URL(req.url, 'http://localhost');
        } catch {
            res.writeHead(400, {
                'Content-Type': 'text/plain; charset=utf-8',
                ...SECURITY_HEADERS
            });
            res.end('Bad Request');
            return;
        }

        const pathname = parsedUrl.pathname;

        // Health check endpoint for internal monitors (e.g. Uptime Kuma) and reverse proxies.
        // Served immediately without client IP resolution or rate limiting to prevent
        // false-positive missing forwarded header warnings and health check denial-of-service.
        if (pathname === '/health') {
            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                ...SECURITY_HEADERS
            });
            if (req.method === 'HEAD') {
                res.end();
            } else {
                res.end('OK');
            }
            return;
        }

        const clientIp = this.getClientIp(req);
        const isLimited = this.isRateLimited(clientIp);

        // Redirect endpoint: /r/:id (strictly 8 hex chars)
        if (pathname.startsWith('/r/')) {
            const id = pathname.slice(3);
            const isValidId = /^[a-f0-9]{8}$/.test(id);
            const record = isValidId ? this.activeLinks.get(id) : null;
            let targetUrl = record?.targetUrl;

            // Re-validate destination URL
            if (targetUrl) {
                try {
                    const targetParsed = new URL(targetUrl);
                    if (targetParsed.protocol !== 'http:' && targetParsed.protocol !== 'https:') {
                        targetUrl = null;
                    } else {
                        targetUrl = targetParsed.href;
                    }
                } catch {
                    targetUrl = null;
                }
            }

            // Unknown or invalid links: return 429 if client is rate-limited, otherwise 404
            if (!targetUrl) {
                if (isLimited) {
                    res.writeHead(429, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Retry-After': '60',
                        ...SECURITY_HEADERS
                    });
                    res.end('Too Many Requests');
                    return;
                }
                res.writeHead(404, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    ...SECURITY_HEADERS
                });
                res.end('Not Found');
                return;
            }

            // Click deduplication: only count GET requests and skip rapid clicks from same IP within 10s.
            // When client IP is rate limited, skip click-counting and disk writes while still fulfilling redirect.
            if (req.method === 'GET' && !isLimited) {
                const dedupKey = `${clientIp}:${id}`;
                const lastClickTime = this.recentClicksMap.get(dedupKey);
                const now = Date.now();

                if (!lastClickTime || now - lastClickTime > CLICK_DEDUP_WINDOW_MS) {
                    record.clicks = (record.clicks || 0) + 1;
                    record.lastClicked = new Date(now).toISOString();
                    this.recentClicksMap.set(dedupKey, now);
                    this.scheduleSave();
                }
            }

            // Return 302 Found redirect
            res.writeHead(302, {
                'Location': targetUrl,
                'Content-Type': 'text/plain; charset=utf-8',
                ...SECURITY_HEADERS
            });
            if (req.method === 'HEAD') {
                res.end();
            } else {
                res.end('Redirecting...');
            }
            return;
        }

        // For all non-redirect endpoints: enforce rate limit
        if (isLimited) {
            res.writeHead(429, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Retry-After': '60',
                ...SECURITY_HEADERS
            });
            res.end('Too Many Requests');
            return;
        }

        // Any other route returns 404
        res.writeHead(404, {
            'Content-Type': 'text/plain; charset=utf-8',
            ...SECURITY_HEADERS
        });
        res.end('Not Found');
    }

    /**
     * Checks if the redirect server is running.
     * @returns {boolean} True if running and listening.
     */
    isRunning() {
        return Boolean(this.server && this.server.listening);
    }

    /**
     * Starts the HTTP redirect server if not already running.
     * @param {object} [options]
     * @param {number} [options.port] The port to listen on.
     * @param {string} [options.host] The host/IP to bind to (defaults to 127.0.0.1 if trustProxy is enabled, else 0.0.0.0).
     * @param {string} [options.baseUrl] The base tracking URL.
     * @param {boolean} [options.trustProxy] Whether to trust reverse proxy headers.
     * @param {string} [options.trustedHeader] Specific proxy header to trust exclusively (e.g. 'cf-connecting-ip').
     * @param {string} [options.owner] Identifier of the caller owning this server reference.
     * @returns {Promise<void>}
     */
    async start({ port = DEFAULT_TRACKING_PORT, host, baseUrl, trustProxy, trustedHeader, owner } = {}) {
        if (owner) {
            this.activeOwners.add(owner);
        }

        if (this.server) {
            if (baseUrl && this.baseUrl && baseUrl !== this.baseUrl) {
                logger.warn('[LinkTracker] Server already running; ignoring conflicting baseUrl.');
            }
            if (trustProxy !== undefined && Boolean(trustProxy) !== this.trustProxy) {
                logger.warn('[LinkTracker] Server already running; ignoring conflicting trustProxy setting.');
            }
            const normalizedHeader = typeof trustedHeader === 'string' && trustedHeader.trim() ? trustedHeader.trim().toLowerCase() : null;
            if (trustedHeader !== undefined && normalizedHeader !== this.trustedHeader) {
                logger.warn('[LinkTracker] Server already running; ignoring conflicting trustedHeader setting.');
            }
            return;
        }

        if (this._startPromise) {
            if (owner && this._startupOwners) {
                this._startupOwners.add(owner);
            }
            return this._startPromise;
        }

        const currentStartupOwners = new Set();
        if (owner) {
            currentStartupOwners.add(owner);
        }
        this._startupOwners = currentStartupOwners;

        this._startPromise = (async () => {
            try {
                this.baseUrl = baseUrl || this.baseUrl;
                if (trustProxy !== undefined) {
                    this.trustProxy = Boolean(trustProxy);
                }
                if (trustedHeader !== undefined) {
                    this.trustedHeader = typeof trustedHeader === 'string' && trustedHeader.trim()
                        ? trustedHeader.trim().toLowerCase()
                        : null;
                }

                await this.loadState();

                this.serverPort = port;
                this.serverHost = host || (this.trustProxy ? '127.0.0.1' : '0.0.0.0');

                this.server = http.createServer((req, res) => {
                    this.handleRequest(req, res).catch(err => {
                        logger.error('[LinkTracker] Unhandled error handling request:', err);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
                            res.end('Internal Server Error');
                        }
                    });
                });

                // Enforce socket timeouts for Slowloris protection
                this.server.requestTimeout = 5000;
                this.server.headersTimeout = 6000;
                this.server.keepAliveTimeout = 5000;
                this.server.maxHeadersCount = 50;

                // Periodic map cleanup
                if (!this._cleanupInterval) {
                    this._cleanupInterval = setInterval(() => this._cleanupMemoryMaps(), 60000);
                    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
                }

                await new Promise((resolve, reject) => {
                    /**
                     * Handles initial server listen errors and cleans up resources.
                     * @param {Error} err The listen error.
                     */
                    const onError = (err) => {
                        logger.error('[LinkTracker] Server error:', err);
                        reject(err);
                    };

                    this.server.once('error', onError);

                    try {
                        this.server.listen(this.serverPort, this.serverHost, () => {
                            this.server.removeListener('error', onError);
                            this.server.on('error', (err) => {
                                logger.error('[LinkTracker] Runtime server error:', err);
                            });
                            logger.info('[LinkTracker] Redirect server running.');
                            resolve();
                        });
                    } catch (err) {
                        this.server.removeListener('error', onError);
                        onError(err);
                    }
                });
            } catch (err) {
                for (const o of currentStartupOwners) {
                    this.activeOwners.delete(o);
                }
                if (this._cleanupInterval) {
                    clearInterval(this._cleanupInterval);
                    this._cleanupInterval = null;
                }
                if (this.server) {
                    try {
                        this.server.close();
                    } catch {
                        // Ignore server close error during failed startup teardown
                    }
                }
                this.server = null;
                this.serverPort = null;
                this.serverHost = null;
                throw err;
            } finally {
                if (this._startupOwners === currentStartupOwners) {
                    this._startupOwners = null;
                }
            }
        })();

        try {
            await this._startPromise;
        } finally {
            this._startPromise = null;
        }
    }

    /**
     * Gracefully stops the HTTP redirect server and flushes pending writes.
     * Decrements the active owners count; only stops the server when no owners remain or when forced.
     * @param {object} [options]
     * @param {string} [options.owner] Identifier of the caller releasing its reference.
     * @param {boolean} [options.force] Whether to forcefully stop regardless of active owners.
     * @returns {Promise<void>}
     */
    async stop({ owner, force = false } = {}) {
        if (owner) {
            this.activeOwners.delete(owner);
        }

        if (!force && owner && this.activeOwners.size > 0) {
            return;
        }

        if (this._startPromise) {
            await this._startPromise.catch(() => {});
        }

        if (!force && this.activeOwners.size > 0) {
            return;
        }

        this.activeOwners.clear();

        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        this._warnedMissingForwardedHeader = false;

        if (this.server) {
            const serverToClose = this.server;
            this.server = null;
            this.serverPort = null;
            this.serverHost = null;
            await new Promise((resolve) => {
                if (typeof serverToClose.closeAllConnections === 'function') {
                    serverToClose.closeAllConnections();
                }
                serverToClose.close((err) => {
                    if (err) {
                        logger.warn('[LinkTracker] Error closing server:', err);
                    } else {
                        logger.info('[LinkTracker] Redirect server stopped.');
                    }
                    resolve();
                });
            });
        }

        if (this.isDirty || this.saveTimeout) {
            await this.saveState().catch(err => {
                logger.error('[LinkTracker] Error saving state on stop:', err);
            });
        }
    }
}

module.exports = new LinkTracker();
