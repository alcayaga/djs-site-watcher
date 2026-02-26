#!/bin/bash
set -e

# Configuration
export TARGET_ENV="${TARGET_ENV:-production}"
TARGET_ENV=$(echo "${TARGET_ENV}" | tr '[:upper:]' '[:lower:]')
readonly TARGET_ENV

# Security: Validate TARGET_ENV (allow alphanumeric, -, _)
if [[ ! "${TARGET_ENV}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "Error: Invalid characters in TARGET_ENV."
    exit 1
fi

# Support DEPLOY_TARGET for tags/commits/branches, fallback to DEPLOY_BRANCH, then master
readonly DEPLOY_TARGET="${DEPLOY_TARGET:-${DEPLOY_BRANCH:-master}}"

# Use DEPLOY_PATH env var or default to current directory if not set
readonly TARGET_DIR="${DEPLOY_PATH:-$(pwd)}"

echo "[Deploy] Starting deployment for environment: ${TARGET_ENV}"
echo "[Deploy] Target Directory: ${TARGET_DIR}"
echo "[Deploy] Target Ref: ${DEPLOY_TARGET}"

# Security: Validate DEPLOY_TARGET (allow alphanumeric, /, -, _, .)
if [[ ! "${DEPLOY_TARGET}" =~ ^[a-zA-Z0-9/._-]+$ || \
     "${DEPLOY_TARGET}" == -* || \
     "${DEPLOY_TARGET}" == "." || \
     "${DEPLOY_TARGET}" =~ ^/ || \
     "${DEPLOY_TARGET}" =~ \.\. || \
     "${DEPLOY_TARGET}" =~ (^|/)\. || \
     "${DEPLOY_TARGET}" =~ // || \
     "${DEPLOY_TARGET}" =~ /$ ]]; then
    echo "Error: Invalid characters or format in DEPLOY_TARGET."
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

# Fetch all updates from remote including tags
echo "[Deploy] Fetching all updates from remote..."
git fetch origin --prune --tags

# Verify that the target ref resolves to a valid commit before checking out.
# This is a security measure to ensure we're checking out a valid and known commit-ish object.
if git rev-parse --verify --quiet "${DEPLOY_TARGET}^{commit}" &>/dev/null; then
    echo "[Deploy] Target '${DEPLOY_TARGET}' is a valid ref. Checking out..."
    git checkout -f "${DEPLOY_TARGET}"
else
    echo "Error: Deploy target '${DEPLOY_TARGET}' could not be resolved to a valid commit."
    exit 1
fi

git clean -fd -e config/

# Install dependencies (production only)
echo "[Deploy] Installing dependencies..."
npm ci --production

# Restart application via PM2 using the ecosystem file and specified environment
echo "[Deploy] Reloading application with PM2 (env: ${TARGET_ENV})..."
pm2 startOrReload ecosystem.config.js --env "${TARGET_ENV}"

echo "[Deploy] Deployment successful!"
