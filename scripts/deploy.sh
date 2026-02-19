#!/bin/bash
set -e

# Configuration
export TARGET_ENV=$(echo "${TARGET_ENV:-production}" | tr '[:upper:]' '[:lower:]')
readonly TARGET_ENV

# Security: Validate TARGET_ENV (allow alphanumeric, -, _)
if [[ ! "${TARGET_ENV}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "Error: Invalid characters in TARGET_ENV."
    exit 1
fi

readonly DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"

# Use DEPLOY_PATH env var or default to current directory if not set
readonly TARGET_DIR="${DEPLOY_PATH:-$(pwd)}"

echo "[Deploy] Starting deployment for environment: ${TARGET_ENV}"
echo "[Deploy] Target Directory: ${TARGET_DIR}"

# Security: Validate DEPLOY_BRANCH (allow alphanumeric, /, -, _, .)
if [[ ! "${DEPLOY_BRANCH}" =~ ^[a-zA-Z0-9/._-]+$ ]]; then
    echo "Error: Invalid characters in DEPLOY_BRANCH."
    exit 1
fi

if [ ! -d "${TARGET_DIR}" ]; then
    echo "Error: Target directory does not exist: ${TARGET_DIR}"
    exit 1
fi

cd "${TARGET_DIR}"

# Security: Sanity check to ensure we are in a valid project directory before running destructive git commands
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found in ${TARGET_DIR}. Aborting to prevent accidental data loss."
    exit 1
fi

# Reset to match remote branch exactly
echo "[Deploy] Fetching latest changes from branch: ${DEPLOY_BRANCH}..."
git fetch origin "${DEPLOY_BRANCH}" --prune
git reset --hard "origin/${DEPLOY_BRANCH}"
git clean -fd -e config/

# Install dependencies (production only)
echo "[Deploy] Installing dependencies..."
npm ci --production

# Restart application via PM2 using the ecosystem file and specified environment
echo "[Deploy] Reloading application with PM2 (env: ${TARGET_ENV})..."
pm2 startOrReload ecosystem.config.js --env "${TARGET_ENV}"

echo "[Deploy] Deployment successful!"
