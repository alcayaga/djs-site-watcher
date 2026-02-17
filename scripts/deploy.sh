#!/bin/bash
set -e

# Use DEPLOY_PATH env var or default to current directory if not set
TARGET_DIR="${DEPLOY_PATH:-$(pwd)}"

echo "[Deploy] Starting deployment to ${TARGET_DIR}..."

cd "${TARGET_DIR}"

# Reset to match remote branch exactly (assuming we want to deploy 'staging' branch)
# We use 'origin/staging' as the target.
echo "[Deploy] Fetching latest changes..."
git fetch origin staging
git reset --hard origin/staging

# Install dependencies (production only)
echo "[Deploy] Installing dependencies..."
npm ci --production

# Restart application via PM2
echo "[Deploy] Restarting application..."
pm2 restart djs-site-watcher-staging || pm2 start src/bot.js --name djs-site-watcher-staging

echo "[Deploy] Deployment successful!"
