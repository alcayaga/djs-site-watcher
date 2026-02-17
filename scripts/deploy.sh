#!/bin/bash
set -e

echo "[Deploy] Starting deployment to staging..."

# Install dependencies (production only)
echo "[Deploy] Installing dependencies..."
npm ci --production

# Restart application via PM2
echo "[Deploy] Restarting application..."
pm2 restart djs-site-watcher-staging || pm2 start src/bot.js --name djs-site-watcher-staging

echo "[Deploy] Deployment successful!"
