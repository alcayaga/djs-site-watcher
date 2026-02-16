const dns = require('dns');
const ipaddr = require('ipaddr.js');

const DEFAULT_REQUEST_TIMEOUT = 10000;
const DEFAULT_RETRY_LIMIT = 2;

/**
 * Checks if an IP address is private or reserved.
 * @param {string} ip The IP address.
 * @returns {boolean} True if private/reserved, false otherwise.
 */
function isPrivateIP(ip) {
    // allow private IPs if explicitly requested via environment variable (e.g. for local testing)
    // but only in non-production environments for safety
    if ((process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') && process.env.ALLOW_PRIVATE_IPS === 'true') {
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
    return {
        timeout: {
            request: DEFAULT_REQUEST_TIMEOUT
        },
        retry: {
            limit: DEFAULT_RETRY_LIMIT
        },
        hooks: {
            beforeRequest: [
                (options) => {
                    const hostname = options.url.hostname;
                    if (ipaddr.isValid(hostname) && isPrivateIP(hostname)) {
                        throw new Error(`SSRF Prevention: Access to private IP ${hostname} is denied.`);
                    }
                }
            ]
        },
        /**
         * Custom DNS lookup to prevent access to private IP addresses.
         * @param {string} hostname The hostname to lookup.
         * @param {object} options The lookup options.
         * @param {function} callback The callback function.
         */
        lookup: (hostname, options, callback) => {
            dns.lookup(hostname, options, (err, address, family) => {
                if (err) return callback(err);

                const addresses = Array.isArray(address) ? address : [{ address, family }];

                for (const addr of addresses) {
                    if (isPrivateIP(addr.address)) {
                        return callback(new Error(`SSRF Prevention: Access to private IP ${addr.address} is denied.`));
                    }
                }

                callback(null, address, family);
            });
        }
    };
}

module.exports = {
    isPrivateIP,
    getSafeGotOptions
};
