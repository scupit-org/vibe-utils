# Vibe Utils

This is just my personal repository for random little tools, some vibe-coded,
some not. Maybe somebody will find one useful!

## Cloud Agent GPG auto-signing

This repo includes scripts and configuration for GPG-signing commits in Cursor Cloud Agents. Setup uses Cursor Secrets, a pair of shell scripts ([setup.sh](./setup.sh), [init-gpg.sh](./init-gpg.sh)) at the repository root, and `.cursor/environment.json`. Set `SCRIPT_DOWNLOAD_ROOT_URL` to `https://raw.githubusercontent.com/scupit-org/vibe-utils/develop` in Cursor Secrets. See the [Cursor Cloud Agent Auto-Sign guide](./guides/gpg-and-cursor-cloud-agent-signing/cursor-cloud-agent-autosign-guide.md) for full setup instructions. The [guide-project](./guides/gpg-and-cursor-cloud-agent-signing/guide-project/) is the example project.

## Projects

| Project | Description |
| --- | --- |
| [apple-shortcut-url-maker](./apple-shortcut-url-maker) | Tiny Python CLI that generates a `shortcuts://` URL for running a named iOS Shortcut, useful for programming NFC tags. |
| [mcp-ecosystem](./mcp-ecosystem) | Provisioning CLI, runtime library, and server bootstrap for building a personal MCP server ecosystem that uses Auth0 for OAuth. Reconciles desired-state JSON config files against an Auth0 tenant and wires token validation into each server at startup. |
| [web-3d-panel-navigation](./web-3d-panel-navigation) | Provides an interesting way to "navigate" within a webpage by clicking on a configurable set of panels organized in 3D. |
| [guide-project](./guides/gpg-and-cursor-cloud-agent-signing/guide-project/) | Example project for the Cloud Agent GPG auto-signing setup (scripts are at repo root). |

## Guides

| Guide | Description |
| --- | --- |
| [GPG Local Setup](./guides/gpg-and-cursor-cloud-agent-signing/gpg-local-setup.md) | Step-by-step walkthrough for installing GPG, generating a key pair, adding the public key to GitHub, and configuring Git to automatically sign commits — with troubleshooting sections for macOS, Windows, and Linux over SSH. |
| [Cursor Cloud Agent Auto-Sign](./guides/gpg-and-cursor-cloud-agent-signing/cursor-cloud-agent-autosign-guide.md) | How to configure Cursor cloud agents to GPG-sign every commit automatically using Cursor Secrets, a pair of downloaded shell scripts, and a `.cursor/environment.json` install hook. |
