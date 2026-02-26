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

# If the target is a branch on the remote, create/reset a local branch to match and check it out.
if git show-ref --verify --quiet "refs/remotes/origin/${DEPLOY_TARGET}"; then
    echo "[Deploy] Target is a branch. Syncing and checking out..."
    git checkout -B "${DEPLOY_TARGET}" "origin/${DEPLOY_TARGET}"
# If it's a tag, check it out unambiguously. This avoids checking out a local branch with the same name.
elif git show-ref --verify --quiet "refs/tags/${DEPLOY_TARGET}"; then
    echo "[Deploy] Target is a tag. Checking out..."
    git checkout -f "tags/${DEPLOY_TARGET}"
# Check if it looks like a commit hash and is a valid commit object.
elif [[ "${DEPLOY_TARGET}" =~ ^[0-9a-fA-F]{7,40}$ ]] && git cat-file -e "${DEPLOY_TARGET}^{commit}" &>/dev/null; then
    echo "[Deploy] Target is a commit hash. Checking out..."
    git checkout -f "${DEPLOY_TARGET}"
else
    echo "Error: Deploy target '${DEPLOY_TARGET}' is not a valid remote branch, tag, or commit hash."
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
