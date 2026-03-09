# Guide Project

Example project for the [GPG and Cursor Cloud Agent signing](../cursor-cloud-agent-autosign-guide.md) guides. The `setup.sh` and `init-gpg.sh` scripts live in the [repository root](../../../) so they are accessible from the web when `SCRIPT_DOWNLOAD_ROOT_URL` points there.

Configured to work with Cursor Cloud Agents, including automatic GPG commit signing.

## Prerequisites

Before starting a cloud agent for this repository, you need to configure the required secrets in your Cursor Dashboard.

## Required Cursor Secrets

Navigate to **Cursor Dashboard → Cloud Agents → Secrets** and add the following secrets:

| Variable | Description |
|----------|-------------|
| **`SCRIPT_DOWNLOAD_ROOT_URL`** | Base URL for downloading setup scripts. Must point to the repository root (where the scripts live). Example: `https://raw.githubusercontent.com/scupit-org/vibe-utils/develop` |
| **`IS_RUNNING_CURSOR_CLOUD_AGENT`** | Flag to enable GPG setup in cloud agents only. Prevents the script from running locally and breaking developers' GPG configurations. Example value: `1` |
| **`GPG_PRIVATE_KEY_BASE64`** | Base64-encoded ASCII-armored GPG private key. This should be your existing GPG private key that you also use locally, exported and then base64 encoded to preserve formatting. Example value: `LS0tLS1CRUdJTiBQR1AgUFJJVkFURSBLRVkgQkxPQ0stLS0tLQo...` (truncated) |
| **`GPG_PRIVATE_KEY_PASSPHRASE`** | The passphrase that protects your GPG private key. Used to unlock the key for non-interactive signing. Example value: `my-secure-passphrase-123!` |
| **`MY_GIT_EMAIL`** | Email address associated with your GPG key and Git commits. Must match the email in your GPG key's UID. Example value: `developer@example.com` |
| **`MY_FULL_NAME`** | Your full name as it should appear in Git commits. Should match the name in your GPG key for consistency. Example value: `Jane Developer` |

## How to Export Your GPG Key

If you need to export your existing GPG private key for the `GPG_PRIVATE_KEY_BASE64` secret:

```bash
# List your GPG keys to find the key ID
gpg --list-secret-keys --keyid-format=long

# Export the private key (replace YOUR_KEY_ID with your actual key ID)
# The 'tr -d' command removes newlines to create a single-line string
gpg --armor --export-secret-keys YOUR_KEY_ID | base64 | tr -d '\n'; echo
```

Copy the output (a single long string) and paste it as the value for `GPG_PRIVATE_KEY_BASE64` in Cursor Secrets.

## Local Development

The `environment.json` configuration is **only used by Cursor Cloud Agents** - it does not affect your local development environment. When you run `npm install` locally, the GPG setup script is never executed.

If you manually run [init-gpg.sh](../../../init-gpg.sh) from the repository root, it will skip execution with a warning message unless `IS_RUNNING_CURSOR_CLOUD_AGENT=1` is set. This safety check prevents accidentally overwriting your local GPG configuration.

## Cloud Agent Behavior

When a cloud agent starts:

1. The `install` command in `environment.json` runs `init-gpg.sh`
2. The script checks for `IS_RUNNING_CURSOR_CLOUD_AGENT` (set via Cursor secrets)
3. GPG signing is configured using your private key
4. `npm install` runs to install dependencies
5. The dev server starts automatically in a terminal

All commits made by the cloud agent will be GPG-signed with your key.

## Files

- **[setup.sh](../../../setup.sh)**, **[init-gpg.sh](../../../init-gpg.sh)** - GPG setup scripts (in the repository root; downloaded during cloud agent install)
- **`.cursor/environment.json`** - Cursor Cloud Agent configuration (example/template in this directory). The [root .cursor/environment.json](../../../../.cursor/environment.json) is used when running cloud agents on this repo.
- **`package.json`** - Node.js dependencies and scripts

## Troubleshooting

### Cloud agent fails with "SCRIPT_DOWNLOAD_ROOT_URL not set"

Make sure the `SCRIPT_DOWNLOAD_ROOT_URL` secret is configured in your Cursor Dashboard under Cloud Agents → Secrets, pointing to your repository's raw content URL.

### Cloud agent fails with "GPG_PRIVATE_KEY_BASE64 not set"

Make sure all six secrets listed above are configured in your Cursor Dashboard under Cloud Agents → Secrets.

### Script runs locally and breaks my GPG config

This shouldn't happen if `IS_RUNNING_CURSOR_CLOUD_AGENT` is only set as a Cursor secret. If you need to test the script locally, you can temporarily set:

```bash
export IS_RUNNING_CURSOR_CLOUD_AGENT=1
./init-gpg.sh
```

**Warning**: Only do this if you understand the implications for your local GPG configuration.

### Commits aren't being signed in cloud agent

Check the cloud agent logs for GPG verification output. The script includes detailed error messages if signing fails.
