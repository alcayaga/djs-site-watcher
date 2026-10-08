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
        shouldRepair: (entry) => entry.minOfferPrice === 399990 || entry.suppressedOfferPrice === 399990,
        apply: (entry) => ({
            ...entry,
            minOfferPrice: 649990,
            minOfferDate: '2026-06-01T03:21:40.144191Z',
            notifiedMinOfferPrice: 649990,
            minNormalPrice: 649990,
            minNormalDate: '2026-06-01T03:21:40.144191Z',
            notifiedMinNormalPrice: 649990,
            lastOfferPrice: entry.lastOfferPrice === 399990 ? 732293 : (entry.lastOfferPrice || 732293),
            lastNormalPrice: entry.lastNormalPrice === 399990 ? 732293 : (entry.lastNormalPrice || 732293)
        })
    },
    '256385': {
        name: 'Apple Watch Series 10 46mm (GPS / Black Aluminum Case / Ink Loop Band) [MWWR3AM/A]',
        shouldRepair: (entry) => entry.minOfferPrice === 329990 || entry.suppressedOfferPrice === 329990,
        apply: (entry) => ({
            ...entry,
            minOfferPrice: 473029,
            minOfferDate: '2026-09-01T00:00:00.000000Z',
            notifiedMinOfferPrice: 473029,
            minNormalPrice: 473029,
            minNormalDate: '2026-09-01T00:00:00.000000Z',
            notifiedMinNormalPrice: 473029,
            lastOfferPrice: entry.lastOfferPrice === 329990 ? 473029 : (entry.lastOfferPrice || 473029),
            lastNormalPrice: entry.lastNormalPrice === 329990 ? 473029 : (entry.lastNormalPrice || 473029)
        })
    },
    '383406': {
        name: 'Apple iPad Air 13 2026 (Wi-Fi / 128 GB / Space Gray) [MH5N4CI/A]',
        shouldRepair: (entry) => entry.minOfferPrice === 899990 || entry.minNormalPrice === 899990 || entry.suppressedOfferPrice === 899990,
        apply: (entry) => ({
            ...entry,
            minOfferPrice: 979990,
            minOfferDate: '2026-08-27T00:00:00.000000Z',
            notifiedMinOfferPrice: 979990,
            minNormalPrice: 999990,
            minNormalDate: '2026-08-27T00:00:00.000000Z',
            notifiedMinNormalPrice: 999990,
            lastOfferPrice: entry.lastOfferPrice === 899990 ? 1141802 : (entry.lastOfferPrice || 1141802),
            lastNormalPrice: entry.lastNormalPrice === 899990 ? 1181990 : (entry.lastNormalPrice || 1181990)
        })
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

        if (!config.shouldRepair(entry)) {
            console.log(`Product ${productId} (${entry.name || config.name}) does not match corruption criteria. Skipping.`);
            continue;
        }

        deals[productId] = config.apply(entry);
        for (const field of SUPPRESSION_FIELDS) {
            delete deals[productId][field];
        }

        repairedCount++;
        const updated = deals[productId];
        console.log(`Repaired product ${productId} (${updated.name || config.name}):`);
        console.log(`  minOffer=${updated.minOfferPrice}, minNormal=${updated.minNormalPrice}, lastOffer=${updated.lastOfferPrice}, lastNormal=${updated.lastNormalPrice}`);
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
        if (fs.existsSync(tempDealsFilePath)) {
            fs.unlinkSync(tempDealsFilePath);
        }
    }

    console.log(`Successfully repaired ${repairedCount} product(s) in ${dealsFilePath}.`);
} catch (error) {
    console.error('Failed to repair deals file:', error);
    process.exit(1);
}
