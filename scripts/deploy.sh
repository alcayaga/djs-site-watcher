#!/bin/bash
set -e

# Use DEPLOY_PATH env var or default to current directory if not set
TARGET_DIR="${DEPLOY_PATH:-$(pwd)}"

echo "[Deploy] Starting deployment to ${TARGET_DIR}..."

cd "${TARGET_DIR}"

# Reset to match remote branch exactly (assuming we want to deploy 'staging' branch)
# We use 'origin/staging' as the target.
echo "[Deploy] Fetching latest changes..."
git fetch origin "${DEPLOY_BRANCH:-staging}"
git reset --hard "origin/${DEPLOY_BRANCH:-staging}"
git clean -fd

# Install dependencies (production only)
echo "[Deploy] Installing dependencies..."
npm ci --production

# Restart application via PM2
echo "[Deploy] Restarting application..."
pm2 startOrRestart ecosystem.config.js --only "${PM2_APP_NAME:-djs-site-watcher-staging}"

echo "[Deploy] Deployment successful!"
