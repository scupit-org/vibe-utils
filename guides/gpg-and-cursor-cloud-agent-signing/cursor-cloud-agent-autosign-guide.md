# Setting up Cursor cloud agents to automatically GPG sign commits

The idea is:

1. Put needed user-specific information (email, GPG private key, etc.) in cloud agent user secrets.
2. Write a bash script to handle the GPG configuration I described above.
3. Configure [.cursor/environment.json](https://cursor.com/docs/cloud-agent#base-environment-setup) to run the script during the cloud agent install step (initialization).

*This solution is set up so that the shell scripts are downloaded on the fly, so they don't have to be saved in a repository* (that way you can use this when contributing to other projects). I ended up splitting this into two scripts just so I had a simpler mental model of the variable scopes. It can probably be condensed into one script, but this works. You can copy these exactly as they are without change - they're configured using cursor secrets (environment variables in the cloud env).

---

<details>
<summary>
setup.sh: This runs the init-gpg.sh script then unsets sensitive environment variables so they aren't accessible in the project's actual install/init command.</summary>

```bash
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
```

</details>

---

<details>
<summary>
init-gpg.sh: This does the full GPG setup I described earlier, but for the headless environment. It configures the cloud agent environment to automatically sign every commit with your GPG private key without requiring any human intervention.</summary>

```sh
#!/bin/bash
set -euo pipefail

# Safety check: Only run in Cursor Cloud Agent environments
# Set IS_RUNNING_CURSOR_CLOUD_AGENT=1 as a secret in Cursor Dashboard
if [[ -z "${IS_RUNNING_CURSOR_CLOUD_AGENT:-}" ]]; then
    echo "ERROR: This script is designed for Cursor Cloud Agents only." >&2
    echo "Skipping GPG setup to avoid breaking your local configuration." >&2
    echo "If you are seeing this error message within a Cursor Cloud Agent environment, please set IS_RUNNING_CURSOR_CLOUD_AGENT=1 in the Cursor dashboard. It should work afterwards." >&2
    exit 1
fi

# Required environment variables (from Cursor Secrets)
: "${GPG_PRIVATE_KEY_BASE64:?Error: GPG_PRIVATE_KEY_BASE64 not set in Cursor Secrets}"
: "${GPG_PRIVATE_KEY_PASSPHRASE:?Error: GPG_PRIVATE_KEY_PASSPHRASE not set in Cursor Secrets}"
: "${MY_GIT_EMAIL:?Error: MY_GIT_EMAIL not set in Cursor Secrets}"
: "${MY_FULL_NAME:?Error: MY_FULL_NAME not set in Cursor Secrets}"

echo "Setting up GPG signing for $MY_FULL_NAME..."

# Initialize GPG home with proper permissions
export GNUPGHOME="${GNUPGHOME:-$HOME/.gnupg}"
mkdir -p "$GNUPGHOME"
chmod 700 "$GNUPGHOME"

# Configure gpg-agent for non-interactive operation. Allowing a preset passphrase allows
# us to enter the password during cloud agent initialization, so it doesn't have to be entered
# after each commit.
cat > "$GNUPGHOME/gpg-agent.conf" <<EOF
allow-preset-passphrase
default-cache-ttl 28800
max-cache-ttl 86400
EOF

# Ensure the above configuration is applied.
gpgconf --kill gpg-agent 2>/dev/null || true
gpgconf --launch gpg-agent

# Decode and import private key (base64 -> ASCII-armored GPG key)
echo "$GPG_PRIVATE_KEY_BASE64" | base64 -d | gpg --batch --import 2>/dev/null

KEY_INFO=$(gpg --with-colons --with-keygrip --list-secret-keys "$MY_GIT_EMAIL" 2>/dev/null)
KEYGRIPS=$(echo "$KEY_INFO" | awk -F: '/^grp:/ {print $10}')
FINGERPRINT=$(echo "$KEY_INFO" | awk -F: '/^fpr:/ {print $10; exit}')

if [[ -z "$KEYGRIPS" ]] || [[ -z "$FINGERPRINT" ]]; then
    echo "Error: Failed to extract keygrip(s) or fingerprint for $MY_GIT_EMAIL" >&2
    echo "Available keys:" >&2
    gpg --list-secret-keys >&2
    exit 1
fi

# Find and use gpg-preset-passphrase (Ubuntu typically has it in /usr/lib/gnupg).
# This is what allows us to preload the passphrase, to ensure the agent doesn't require any
# user interaction for signing.
GPG_PRESET=""
for preset_path in \
    "/usr/lib/gnupg/gpg-preset-passphrase" \
    "/usr/lib/gnupg2/gpg-preset-passphrase" \
    "/usr/libexec/gpg-preset-passphrase" \
    "$(command -v gpg-preset-passphrase 2>/dev/null || echo '')"; do
    if [[ -x "$preset_path" ]]; then
        GPG_PRESET="$preset_path"
        break
    fi
done

if [[ -z "$GPG_PRESET" ]]; then
    echo "Error: gpg-preset-passphrase not found. Installing gnupg2..." >&2
    # gpg-preset-passphrase is only supported in GPG 2.0 or later. I think Ubuntu will have this
    # by default, but if they don't, we'll install it.
    sudo apt-get update && sudo apt-get install -y gnupg2
    GPG_PRESET="/usr/lib/gnupg/gpg-preset-passphrase"
fi

# Load the passphrase into gpg-agent cache for all keygrips (primary + subkeys).
# This ensures gpg will never ask for the passphrase, regardless of which key it uses.
# As a result, also ensures it works with non-default GPG key setups like using
# a subkey for signing instead of the primary key.
for KEYGRIP in $KEYGRIPS; do
    printf '%s' "$GPG_PRIVATE_KEY_PASSPHRASE" | "$GPG_PRESET" --preset "$KEYGRIP"
done

# Configure Git globally for automatic signing
git config --global user.name "$MY_FULL_NAME"
git config --global user.email "$MY_GIT_EMAIL"
git config --global user.signingkey "$FINGERPRINT"
git config --global commit.gpgsign true
git config --global gpg.program "gpg"

# Quick double check to make sure we can actually sign things without additional interaction.
if echo "test" | gpg --batch --yes \
    --local-user "$FINGERPRINT" --clearsign >/dev/null 2>&1; then
    echo "[OK] GPG signing configured successfully"
    echo "  Name: $MY_FULL_NAME"
    echo "  Email: $MY_GIT_EMAIL"
    echo "  Fingerprint: $FINGERPRINT"
else
    echo "ERROR: GPG signing verification failed!" >&2
    echo "Debugging information:" >&2
    gpg --list-secret-keys "$MY_GIT_EMAIL" >&2
    echo "" >&2
    echo "Attempting test signature with verbose output:" >&2
    echo "test" | gpg --batch --yes \
        --local-user "$FINGERPRINT" --clearsign 2>&2 || true
    exit 1
fi
```

</details>

---

<details>
<summary>
Example .cursor/environment.json</summary>

```json
{
  "install": "{ [[ -n \"${SCRIPT_DOWNLOAD_ROOT_URL:-}\" ]] || { echo \"ERROR: SCRIPT_DOWNLOAD_ROOT_URL not set in Cursor Secrets\" >&2; false; }; } && { echo \"[Setup] Downloading from: $SCRIPT_DOWNLOAD_ROOT_URL/setup.sh\" && _setup_script=$(curl -fsSL \"$SCRIPT_DOWNLOAD_ROOT_URL/setup.sh\") && source /dev/stdin <<< \"$_setup_script\"; } && npm install",
  "terminals": [
    {
      "name": "Dev Server",
      "command": "npm run dev"
    }
  ]
}
```

</details>

---

- *setup.sh* and *init-gpg.sh* have to be put in their own separate repository, or somewhere on the web where they can be freely downloaded from the same base URL. In this repo, the scripts live in the [repository root](../../) so they are accessible from the web.

- *.cursor/environment.json* has to be put in the repository you're working on. I imagine many open source projects wouldn't appreciate you adding this to their repo, so I recommend adding it to your local, private ignore file instead of .gitignore:
  `echo ".cursor/environment.json" >> .git/info/exclude`

Once those are all ready, configure these user secrets in cursor's cloud agent dashboard (or the editor settings):

- `IS_RUNNING_CURSOR_CLOUD_AGENT`: Flag to safeguard against running this script in a local environment. Set it to `1` in secrets.
- `SCRIPT_DOWNLOAD_ROOT_URL`: Base URL for downloading setup scripts. For this repo, use `https://raw.githubusercontent.com/scupit-org/vibe-utils/develop` (replace `develop` with your branch if different). The scripts must be at the root so they are web-accessible. For other setups, if your scripts are in a repo called *my-scripts-repo* on the *main* branch, use `https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/my-scripts-repo/main`
- `GPG_PRIVATE_KEY_BASE64`: base64 encoded ASCII-armored GPG private key.
- `GPG_PRIVATE_KEY_PASSPHRASE`: Password for your private key.
- `MY_GIT_EMAIL`: Email address associated with your GPG key and Git commits.
- `MY_FULL_NAME`: Your full name (also associated with commits and GPG key).

The private key is base64 encoded just so I can guarantee nothing breaks when I put it in the single-line secret input. Use this to export the key in that way:

```bash
# List your GPG keys to find the key ID
gpg --list-secret-keys --keyid-format=long

# Export the private key (replace YOUR_KEY_ID with your actual key ID)
# The 'tr -d' command removes newlines to create a single-line string
gpg --armor --export-secret-keys YOUR_KEY_ID | base64 | tr -d '\n'; echo
```

And a quick note about the cloud agent environment file, the `&& npm install` is the actual init command for the project. Everything before that is part of the setup to call *setup.sh* properly. Feel free to change that and the terminal list as needed to fit your project.

---

To summarize, here's the expected setup:

1. You have the two shell scripts saved in an external repository or hosted on a server so that you can download them with an HTTP request (hosting in a github repo is fine). Make sure the names are exactly *setup.sh* and *init-gpg.sh*.
2. You have a *.cursor/environment.json* file **in your locally cloned copy of the project**, ensured git ignores it by specifying it in your private, local *.git/info/exclude* file.
3. All 6 user SECRETS are properly configured.

Auto-signing for all commits should work once you have all that in place.
