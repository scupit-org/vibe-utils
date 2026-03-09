#!/bin/bash
# This script is designed to be SOURCED in Cursor Cloud Agent environments
# Usage: source <(curl -fsSL "$SCRIPT_DOWNLOAD_ROOT_URL/setup.sh")

set -euo pipefail

# Validate that the repository URL is set
if [[ -z "${SCRIPT_DOWNLOAD_ROOT_URL:-}" ]]; then
    echo "ERROR: SCRIPT_DOWNLOAD_ROOT_URL environment variable not set" >&2
    echo "Please add it as a secret in Cursor Dashboard" >&2
    echo "Example: https://raw.githubusercontent.com/YOUR_USERNAME/your-repo/main" >&2
    return 1
fi

echo "[Setup] Using repository: $SCRIPT_DOWNLOAD_ROOT_URL"
echo "[Setup] Downloading GPG init script from: $SCRIPT_DOWNLOAD_ROOT_URL/init-gpg.sh"

# Download and execute init-gpg.sh directly without saving to disk
if ! curl -fsSL "$SCRIPT_DOWNLOAD_ROOT_URL/init-gpg.sh" | bash; then
    echo "ERROR: GPG initialization failed" >&2
    return 1
fi

# Security: Clear sensitive environment variables to prevent exposure to subsequent
# commands in the Cloud agent "install" step (e.g., npm install). This protects
# against malicious dependencies.
echo "[Setup] Clearing sensitive environment variables..."
unset SCRIPT_DOWNLOAD_ROOT_URL
unset GPG_PRIVATE_KEY_BASE64
unset GPG_PRIVATE_KEY_PASSPHRASE
unset MY_GIT_EMAIL
unset MY_FULL_NAME

echo "[Setup] GPG configuration complete"