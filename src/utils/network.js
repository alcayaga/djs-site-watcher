const dns = require('dns');
const ipaddr = require('ipaddr.js');
const config = require('../config');

/**
 * Checks if an IP address is private or reserved.
 * @param {string} ip The IP address.
 * @returns {boolean} True if private/reserved, false otherwise.
 */
function isPrivateIP(ip) {
    // allow private IPs if explicitly requested via environment variable (e.g. for local testing)
    if (config.ALLOW_PRIVATE_IPS) {
        return false;
    }
    try {
        const addr = ipaddr.parse(ip);
        // The 'unicast' range is the only one considered public.
        // All other ranges (private, reserved, loopback, etc.) will be blocked.
        return addr.range() !== 'unicast';
    } catch (e) {
        // If parsing fails, it's not a valid IP, so we can treat it as unsafe.
        return true;
    }
}

/**
 * Returns options for 'got' to prevent SSRF by blocking private IPs.
 * @returns {object} The options object for 'got'.
 */
function getSafeGotOptions() {
    /**
     * Custom DNS lookup to prevent access to private IP addresses.
     * @param {string} hostname The hostname to lookup.
     * @param {object} options The lookup options.
     * @param {function} callback The callback function.
     */
    const dnsLookup = (hostname, options, callback) => {
        let normalizedOptions = options;
        let cb = callback;

        if (typeof normalizedOptions === 'function') {
            cb = normalizedOptions;
            normalizedOptions = {};
        } else if (typeof normalizedOptions === 'number') {
            normalizedOptions = { family: normalizedOptions };
        } else if (!normalizedOptions) {
            normalizedOptions = {};
        }

        dns.lookup(hostname, normalizedOptions, (err, address, family) => {
            if (err) return cb(err);

            const addresses = Array.isArray(address) ? address : [{ address, family }];
            if (addresses.length === 0) {
                return cb(new Error(`DNS Lookup failed for ${hostname}: No addresses found.`));
            }

            for (const entry of addresses) {
                if (isPrivateIP(entry.address)) {
                    return cb(new Error(`SSRF Prevention: Access to private IP ${entry.address} is denied.`));
                }
            }

            // If 'all' option was true, we must return the original array of objects.
            // Otherwise, return the first address and family as strings/numbers.
            if (normalizedOptions.all) {
                cb(null, address);
            } else {
                cb(null, addresses[0].address, addresses[0].family);
            }
        });
    };

    return {
        // Prefer IPv4 by default to avoid Node 20+ Happy Eyeballs socket collisions on systems lacking IPv6 routes
        dnsLookupIpVersion: config.dnsLookupIpVersion || 'ipv4',
        dnsCache: false,
        timeout: {
            request: config.requestTimeout
        },
        retry: {
            limit: config.retryLimit
        },
        lookup: dnsLookup,
        dnsLookup: dnsLookup,
        hooks: {
            beforeRequest: [
                (options) => {
                    const hostname = options.url.hostname;
                    if (ipaddr.isValid(hostname) && isPrivateIP(hostname)) {
                        throw new Error(`SSRF Prevention: Access to private IP ${hostname} is denied.`);
                    }
                }
            ]
        }
    };
}

module.exports = {
    isPrivateIP,
    getSafeGotOptions
};
