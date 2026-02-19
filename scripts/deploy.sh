#!/bin/bash
set -e

# Configuration
export TARGET_ENV="${TARGET_ENV:-production}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
# Use DEPLOY_PATH env var or default to current directory if not set
TARGET_DIR="${DEPLOY_PATH:-$(pwd)}"

echo "[Deploy] Starting deployment for environment: ${TARGET_ENV}"
echo "[Deploy] Target Directory: ${TARGET_DIR}"

cd "${TARGET_DIR}"

# Reset to match remote branch exactly
echo "[Deploy] Fetching latest changes from branch: ${DEPLOY_BRANCH}..."
git fetch origin "${DEPLOY_BRANCH}"
git reset --hard "origin/${DEPLOY_BRANCH}"
git clean -fd -e config/

# Install dependencies (production only)
echo "[Deploy] Installing dependencies..."
npm ci --production

# Restart application via PM2 using the ecosystem file and specified environment
echo "[Deploy] Reloading application with PM2 (env: ${TARGET_ENV})..."
pm2 reload ecosystem.config.js --env "${TARGET_ENV}" || pm2 start ecosystem.config.js --env "${TARGET_ENV}"

echo "[Deploy] Deployment successful!"
