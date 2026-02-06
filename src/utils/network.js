const dns = require('dns');

/**
 * Checks if an IP address is private or reserved.
 * @param {string} ip The IP address.
 * @returns {boolean} True if private/reserved, false otherwise.
 */
function isPrivateIP(ip) {
    // Handle IPv4-mapped IPv6 addresses
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    const parts = ip.split('.');
    if (parts.length === 4) { // IPv4
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const p2 = parseInt(parts[2], 10);
        
        // 0.0.0.0/8 (Current network)
        if (p0 === 0) return true;
        // 10.0.0.0/8 (Private)
        if (p0 === 10) return true;
        // 100.64.0.0/10 (Shared Address Space / CGNAT)
        if (p0 === 100 && (p1 >= 64 && p1 <= 127)) return true;
        // 127.0.0.0/8 (Loopback)
        if (p0 === 127) return true;
        // 169.254.0.0/16 (Link-local)
        if (p0 === 169 && p1 === 254) return true;
        // 172.16.0.0/12 (Private)
        if (p0 === 172 && (p1 >= 16 && p1 <= 31)) return true;
        // 192.0.0.0/24 (IETF Protocol Assignments)
        if (p0 === 192 && p1 === 0 && p2 === 0) return true;
         // 192.0.2.0/24 (TEST-NET-1)
        if (p0 === 192 && p1 === 0 && p2 === 2) return true;
        // 192.88.99.0/24 (6to4 Relay Anycast)
        if (p0 === 192 && p1 === 88 && p2 === 99) return true;
        // 192.168.0.0/16 (Private)
        if (p0 === 192 && p1 === 168) return true;
        // 198.18.0.0/15 (Network Benchmark)
        if (p0 === 198 && (p1 >= 18 && p1 <= 19)) return true;
         // 198.51.100.0/24 (TEST-NET-2)
        if (p0 === 198 && p1 === 51 && p2 === 100) return true;
        // 203.0.113.0/24 (TEST-NET-3)
        if (p0 === 203 && p1 === 0 && p2 === 113) return true;
        // 224.0.0.0/4 (Multicast)
        if (p0 >= 224 && p0 <= 239) return true;
        // 240.0.0.0/4 (Reserved)
        if (p0 >= 240) return true;
        // 255.255.255.255 (Broadcast)
        if (ip === '255.255.255.255') return true;
        
        return false;
    }
    
    // IPv6 checks
    // Loopback
    if (ip === '::1') return true;
    // Unspecified
    if (ip === '::') return true;
    // Unique Local Address (fc00::/7) - fc.. or fd..
    if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true;
    // Link-Local (fe80::/10) - fe8, fe9, fea, feb
    if (ip.toLowerCase().startsWith('fe8') || ip.toLowerCase().startsWith('fe9') || ip.toLowerCase().startsWith('fea') || ip.toLowerCase().startsWith('feb')) return true;
    // IPv4-compatible IPv6 (deprecated, but safe to block) ::0.0.0.0
    if (ip.startsWith('::') && ip.includes('.')) return true;
    
    return false;
}

/**
 * Returns options for 'got' to prevent SSRF by blocking private IPs.
 * @returns {object} The options object for 'got'.
 */
function getSafeGotOptions() {
    return {
        /**
         * Custom DNS lookup to prevent access to private IP addresses.
         * @param {string} hostname The hostname to lookup.
         * @param {object} options The lookup options.
         * @param {function} callback The callback function.
         */
        dnsLookup: (hostname, options, callback) => {
            dns.lookup(hostname, options, (err, address, family) => {
                if (err) return callback(err);
                if (isPrivateIP(address)) {
                    return callback(new Error(`SSRF Prevention: Access to private IP ${address} is denied.`));
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
