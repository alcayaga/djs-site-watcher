#!/usr/bin/env node

/**
 * Script to fix corrupted deal state for product 125322 (iPad Mini 6) in config/deals.json.
 * This repairs the false-positive historic minimum ($399.990) caused by BackOnline (refurbished store),
 * restoring the true historic minimum ($649.990) and current valid market price ($777.293).
 */

const fs = require('fs');
const path = require('path');

const dealsFilePath = process.argv[2] || path.join(__dirname, '../config/deals.json');

if (!fs.existsSync(dealsFilePath)) {
    console.error(`Deals file not found at: ${dealsFilePath}`);
    process.exit(1);
}

try {
    const rawData = fs.readFileSync(dealsFilePath, 'utf8');
    const deals = JSON.parse(rawData);

    const productId = '125322';
    const currentEntry = deals[productId];

    if (!currentEntry) {
        console.log(`Product ${productId} not found in ${dealsFilePath}. Nothing to fix.`);
        process.exit(0);
    }

    console.log(`Found product ${productId}: ${currentEntry.name}`);
    console.log(`Current state: minOffer=${currentEntry.minOfferPrice}, lastOffer=${currentEntry.lastOfferPrice}`);

    // Create a backup
    const backupPath = `${dealsFilePath}.backup_${Date.now()}`;
    fs.writeFileSync(backupPath, rawData, 'utf8');
    console.log(`Created backup at: ${backupPath}`);

    // Update with true historic minimum and current valid price
    deals[productId] = {
        ...currentEntry,
        minOfferPrice: 649990,
        minOfferDate: '2026-06-01T03:21:40.144191Z',
        notifiedMinOfferPrice: 649990,
        minNormalPrice: 649990,
        minNormalDate: '2026-06-01T03:21:40.144191Z',
        notifiedMinNormalPrice: 649990,
        lastOfferPrice: 777293,
        lastNormalPrice: 777293
    };
    delete deals[productId].pendingExitOffer;
    delete deals[productId].pendingExitNormal;

    fs.writeFileSync(dealsFilePath, JSON.stringify(deals, null, 2) + '\n', 'utf8');
    console.log(`Successfully restored product ${productId} in ${dealsFilePath}:`);
    console.log(`New state: minOffer=649990, minNormal=649990, lastOffer=777293, lastNormal=777293`);
} catch (error) {
    console.error('Failed to update deals file:', error);
    process.exit(1);
}
