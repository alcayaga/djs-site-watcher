#!/usr/bin/env node

/**
 * Script to fix corrupted deal state for products affected by refurbished store alerts
 * and phantom/unverified prices (e.g. BackOnline, NotebookStore phantom listings) in config/deals.json.
 *
 * Repaired products:
 * - 125322: Apple iPad Mini 8.3 2021 (64 GB / Space Gray) [MK7M3CI/A]
 *   Restores true historic minimum ($649.990) and clears corrupted minimum ($399.990)
 * - 256385: Apple Watch Series 10 46mm (GPS / Black Aluminum / Ink Loop) [MWWR3AM/A]
 *   Restores true historic minimum ($473.029) and clears corrupted minimum ($329.990)
 * - 383406: Apple iPad Air 13 2026 (Wi-Fi / 128 GB / Space Gray) [MH5N4CI/A]
 *   Restores true historic minimum ($979.990 offer / $999.990 normal) and clears phantom minimum ($899.990)
 *
 * NOTE: Stop the bot process before running this script to avoid concurrent in-memory state overwrites,
 * and restart the bot afterward so it loads the repaired state from disk.
 */

const fs = require('fs');
const path = require('path');

const dealsFilePath = process.argv[2] || path.join(__dirname, '../config/deals.json');

if (!fs.existsSync(dealsFilePath)) {
    console.error(`Deals file not found at: ${dealsFilePath}`);
    process.exit(1);
}

const PRODUCT_REPAIRS = {
    '125322': {
        name: 'Apple iPad Mini 8.3 2021 (64 GB / Space Gray)',
        corruptPrice: 399990,
        validMinOffer: 649990,
        validMinNormal: 649990,
        validMinDate: '2026-06-01T03:21:40.144191Z'
    },
    '256385': {
        name: 'Apple Watch Series 10 46mm (GPS / Black Aluminum Case / Ink Loop Band) [MWWR3AM/A]',
        corruptPrice: 329990,
        validMinOffer: 473029,
        validMinNormal: 473029,
        validMinDate: '2026-09-01T00:00:00.000000Z'
    },
    '383406': {
        name: 'Apple iPad Air 13 2026 (Wi-Fi / 128 GB / Space Gray) [MH5N4CI/A]',
        corruptPrice: 899990,
        validMinOffer: 979990,
        validMinNormal: 999990,
        validMinDate: '2026-08-27T00:00:00.000000Z'
    }
};

const SUPPRESSION_FIELDS = [
    'pendingExitOffer',
    'pendingExitNormal',
    'suppressedOfferPrice',
    'suppressedNormalPrice',
    'suppressedOfferValidMin',
    'suppressedNormalValidMin',
    'suppressedOfferTime',
    'suppressedNormalTime'
];

try {
    const rawData = fs.readFileSync(dealsFilePath, 'utf8');
    const deals = JSON.parse(rawData);

    let repairedCount = 0;

    for (const [productId, config] of Object.entries(PRODUCT_REPAIRS)) {
        const entry = deals[productId];
        if (!entry) {
            console.log(`Product ${productId} (${config.name}) not found in ${dealsFilePath}. Skipping.`);
            continue;
        }

        const isMinCorrupt = entry.minOfferPrice === config.corruptPrice || entry.minNormalPrice === config.corruptPrice;
        const hasSuppression = SUPPRESSION_FIELDS.some(field => field in entry);
        const hasCorruptLast = entry.lastOfferPrice === config.corruptPrice || entry.lastNormalPrice === config.corruptPrice;

        if (!isMinCorrupt && !hasSuppression && !hasCorruptLast) {
            console.log(`Product ${productId} (${entry.name || config.name}) does not require repair. Skipping.`);
            continue;
        }

        const updated = { ...entry };

        if (entry.minOfferPrice === config.corruptPrice) {
            updated.minOfferPrice = config.validMinOffer;
            updated.minOfferDate = config.validMinDate;
            updated.notifiedMinOfferPrice = config.validMinOffer;
            console.log(`Restored minOfferPrice for ${productId}: ${updated.minOfferPrice}`);
        }

        if (entry.minNormalPrice === config.corruptPrice) {
            updated.minNormalPrice = config.validMinNormal;
            updated.minNormalDate = config.validMinDate;
            updated.notifiedMinNormalPrice = config.validMinNormal;
            console.log(`Restored minNormalPrice for ${productId}: ${updated.minNormalPrice}`);
        }

        if (updated.lastOfferPrice === config.corruptPrice) {
            delete updated.lastOfferPrice;
        }
        if (updated.lastNormalPrice === config.corruptPrice) {
            delete updated.lastNormalPrice;
        }

        for (const field of SUPPRESSION_FIELDS) {
            delete updated[field];
        }

        deals[productId] = updated;
        repairedCount++;
        console.log(`Repaired product ${productId} (${updated.name || config.name}) state.`);
    }

    if (repairedCount === 0) {
        console.log('No products needed repair. File left untouched.');
        process.exit(0);
    }

    // Backup original before writing
    const backupPath = `${dealsFilePath}.backup_${Date.now()}`;
    fs.writeFileSync(backupPath, rawData, 'utf8');
    console.log(`Backup created at: ${backupPath}`);

    // Atomic write
    const tempDealsFilePath = `${dealsFilePath}.tmp_${process.pid}_${Date.now()}`;
    try {
        fs.writeFileSync(tempDealsFilePath, JSON.stringify(deals, null, 2) + '\n', 'utf8');
        fs.renameSync(tempDealsFilePath, dealsFilePath);
    } finally {
        try {
            if (fs.existsSync(tempDealsFilePath)) {
                fs.unlinkSync(tempDealsFilePath);
            }
        } catch {
            // Preserve the original write or rename error.
        }
    }

    console.log(`Successfully repaired ${repairedCount} product(s) in ${dealsFilePath}.`);
} catch (error) {
    console.error('Failed to repair deals file:', error);
    process.exit(1);
}
