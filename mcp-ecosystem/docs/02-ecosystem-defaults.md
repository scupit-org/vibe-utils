# Ecosystem Defaults

This document describes every hardcoded default in `@scupit/mcp-ecosystem`. These defaults are built into the toolkit and applied automatically. You only need to override them if your use case specifically requires different values.

All defaults are defined in `src/config/defaults.ts` and merged with your `ecosystem-configuration.json` at load time.

For the higher-level mental model of how `.env`, `.env.example`, client caches, and server bootstrap fit together, see [Managed Env And Reconciliation Lifecycle](./03-managed-env-and-reconciliation-lifecycle.md).

---

## Environment Variables

Deployment-specific values are configured via environment variables in the ecosystem's root `.env` file (or exported in your shell), not in version-controlled JSON files.

There are three categories of environment variables. Each has a different audience and different security implications. Understanding which category a variable belongs to is important because **MCP servers run user-defined tool code** and have access to `process.env`. The server bootstrap intentionally excludes CLI-only variables from the server process to prevent leaking sensitive credentials. See [Security: environment variable isolation](#security-environment-variable-isolation) below.

The toolkit manages `.env` and `.env.example` using a tool-owned block marked with `# <automatically-generated>` / `# </automatically-generated>`. Content outside that block is always preserved verbatim. Content inside the block is considered generated output and may be replaced on the next run.

The current runtime loader assumes one ecosystem/server context per Node process. Environment variables are loaded into `process.env` for that process and are not isolated for running multiple different ecosystem contexts side-by-side in the same process.

### Ecosystem configuration variables

These are needed by **both** the CLI and MCP servers at runtime. They may come from the ecosystem root `.env` file or from the shell environment, and they are loaded into `process.env` when a server starts.

| Variable | Required | Description |
| --- | --- | --- |
| `ECOSYSTEM_BASE_DOMAIN` | Yes | Your base domain (e.g., `example.com`). Used to derive every server's hostname, resource URI, and MCP endpoint. |
| `AUTH0_TENANT_DOMAIN` | Yes | Your Auth0 tenant domain (e.g., `my-tenant.us.auth0.com`). Used by the CLI for provisioning and by MCP servers to derive the JWT issuer and JWKS URI for token validation. |

The `management_audience` is always derived as `https://{AUTH0_TENANT_DOMAIN}/api/v2/` and never needs to be configured separately.

`domain.base_domain` in `ecosystem-configuration.json` is intentionally unsupported. Set `ECOSYSTEM_BASE_DOMAIN` in env instead.

### CLI provisioning credentials

These are needed **only by the CLI** for Auth0 Management API access. They are not part of the accepted MCP server runtime surface, and the toolkit removes them from `process.env` during `createMcpServer()` bootstrap.

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH0_MGMT_CLIENT_ID` | Yes (CLI only) | Client ID of a Machine-to-Machine application authorized against the Auth0 Management API. |
| `AUTH0_MGMT_CLIENT_SECRET` | Yes (CLI only) | Client secret of the same M2M application. **This is a sensitive admin credential** that grants full management access to your Auth0 tenant. |

Commands that don't need Auth0 (like `generate-artifacts`) work without these variables. Commands that do need them will error with a detailed message explaining what the variable is, why it's needed, and where to configure it.

`generate-artifacts` writes placeholder values to `.env.example` only. It never copies live tenant domains, client IDs, or client secrets into the example file.

Template placeholders such as `example.com`, `your-tenant.auth0.com`, and `__REQUIRED__` are not treated as valid configuration. Replace them before starting a server or provisioning against Auth0.

Per-server `.env` files must not define these shared ecosystem/Auth0 variables. If they are present in a server-local `.env`, runtime startup fails with a corrective error telling you to move them to the ecosystem root `.env`.

### Auto-generated client variables

These are written to the `.env` managed block by the CLI during `reconcile-client` or `reconcile-all`. They are tool-owned values, and the toolkit removes them from `process.env` during `createMcpServer()` bootstrap.

| Variable pattern | Written when | Description |
| --- | --- | --- |
| `AUTH0_{KEY}_CLIENT_ID` | Client reconciled (created or reused) | The Auth0 Application ID for a provisioned client. Used by the CLI as a local cache to avoid re-searching Auth0 on subsequent runs. |
| `AUTH0_{KEY}_CLIENT_SECRET` | Confidential client created | The client secret, captured at creation time with write-once semantics. Used by the client application itself (not the server) when requesting tokens. |

`{KEY}` is derived from `client_key` via `toUpperCase().replace(/-/g, "_")`. For example, `sync-worker` becomes `AUTH0_SYNC_WORKER_CLIENT_ID`.

`client_key` must be env-safe: lowercase, start with a letter, may contain digits or hyphens, and end with an alphanumeric character. This prevents invalid env names and collisions between generated credential variables.

These variables exist because Auth0 only returns a client secret at creation time. The CLI persists them so they are not lost. **Manually deleting a secret line from `.env` is unrecoverable** without rotating the credential in the Auth0 Dashboard.

MCP servers do not need client IDs or secrets. Servers validate incoming requests by verifying the JWT signature, issuer, audience, and scopes via Auth0's JWKS endpoint. The access control decision (which clients may request tokens for which APIs) is enforced by Auth0 at token issuance time, configured by the CLI's `reconcile-server` and `grant-client` commands.

The `.env` managed block is intentionally tool-owned. If you want to document extra variables or add notes for humans, put them outside the managed block so future reconciliations preserve them.

Auto-generated `AUTH0_{KEY}_CLIENT_ID` and `AUTH0_{KEY}_CLIENT_SECRET` entries must exist only inside that managed block. If one of those keys appears in user-authored root `.env` content outside the block, reconciliation fails with a corrective error instead of silently reusing or overwriting it.

### Security: environment variable isolation

When an MCP server starts via `createMcpServer()`, the server bootstrap loads environment variables into `process.env` with a filter that **excludes all variables matching `AUTH0_*_CLIENT_ID` and `AUTH0_*_CLIENT_SECRET`**. This covers both the management credentials and all per-client credentials.

This exclusion applies to inherited shell environment variables as well as values loaded from `.env` files.

The filter uses a denylist for known Auth0 credential patterns. Any variable that does not match the exclusion pattern (including user-defined variables) is passed through to the server process.

The accepted boundary is the call to `createMcpServer()`. User code that reads or copies `process.env` before calling `createMcpServer()` can still capture inherited shell variables explicitly. Once bootstrap runs, the toolkit removes the excluded Auth0 credential variables from `process.env`.

**What is loaded into MCP server `process.env`:**

- `ECOSYSTEM_BASE_DOMAIN`
- `AUTH0_TENANT_DOMAIN`
- `PORT` (if set)
- Any user-defined variables in the ecosystem `.env` or the MCP-local `.env`

**What is excluded from MCP server `process.env`:**

- `AUTH0_MGMT_CLIENT_ID`
- `AUTH0_MGMT_CLIENT_SECRET`
- `AUTH0_{KEY}_CLIENT_ID` (all per-client IDs)
- `AUTH0_{KEY}_CLIENT_SECRET` (all per-client secrets)

This isolation matters because MCP servers execute user-defined tool code that has full access to `process.env`. Without filtering, every server would have access to your Auth0 Management API credentials, which grant full administrative control over your tenant.

For the full `.env` file structure and setup instructions, see [Setting up the `.env` file](../README.md#set-up-an-ecosystem-directory) in the README.

---

## API Settings

Applied to every Auth0 API (resource server) created by the provisioner.

| Setting | Default | Rationale |
| --- | --- | --- |
| `signing_alg` | `RS256` | Auth0's MCP quickstart uses RS256. Industry standard for JWT signing. |
| `token_dialect` | `rfc9068_profile_authz` | Includes the `permissions` claim in access tokens, needed for scope-based authorization. |
| `user_access_policy` | `require_client_grant` | Interactive clients need an explicit grant. Prevents accidental access. |
| `client_access_policy` | `deny_all` | Machine-to-machine access is blocked unless explicitly enabled per server. Least-privilege default. |

Override in `ecosystem-configuration.json`:

```json
{
  "defaults": {
    "api": {
      "user_access_policy": "allow_all"
    }
  }
}
```

---

## Scope Profiles

Named sets of scopes that servers reference via `scope_profile` in their `mcp-configuration.json`.

### `readonly`

| Scope | Description |
| --- | --- |
| `resources.read` | Read MCP resources |
| `prompts.read` | Read MCP prompts |
| `tools.read` | Execute read-only tools |

### `standard`

| Scope | Description |
| --- | --- |
| `resources.read` | Read MCP resources |
| `prompts.read` | Read MCP prompts |
| `tools.read` | Execute read-only tools |
| `tools.write` | Execute mutating tools |

Custom profiles can be added in `ecosystem-configuration.json`. They merge with the built-in ones (user-defined profiles with the same name override the built-in definition):

```json
{
  "defaults": {
    "scope_profiles": {
      "minimal": ["tools.read"],
      "standard": ["resources.read", "tools.read", "tools.write"]
    }
  }
}
```

---

## Client Profiles

Defines how each type of OAuth client maps to Auth0 application settings. These are the four supported profiles.

### `native_interactive`

For desktop apps (Cursor), local tools, and native workbenches.

| Setting | Value |
| --- | --- |
| Auth0 application type | `native` |
| Access mode | `user` |
| Grant strategy | Authorization Code + PKCE |
| Token endpoint auth method | `none` (public client) |
| Refresh tokens | Enabled |
| Refresh token rotation | Enabled |

### `spa_interactive`

For browser-only frontends.

| Setting | Value |
| --- | --- |
| Auth0 application type | `spa` |
| Access mode | `user` |
| Grant strategy | Authorization Code + PKCE |
| Token endpoint auth method | `none` (public client) |
| Refresh tokens | Enabled |
| Refresh token rotation | Enabled |

### `regular_web_interactive`

For backend web apps that own the OAuth exchange.

| Setting | Value |
| --- | --- |
| Auth0 application type | `regular_web` |
| Access mode | `user` |
| Grant strategy | Authorization Code |
| Token endpoint auth method | `client_secret_post` |
| Refresh tokens | Enabled |

### `service_m2m`

For cron jobs, daemons, workers, and unattended automation.

| Setting | Value |
| --- | --- |
| Auth0 application type | `m2m` |
| Access mode | `machine` |
| Grant strategy | Client Credentials |
| Token endpoint auth method | `client_secret_post` |
| Refresh tokens | Not applicable |

Client profiles can be overridden in `ecosystem-configuration.json`, though this is rarely needed:

```json
{
  "defaults": {
    "client_profiles": {
      "native_interactive": {
        "application_type": "native",
        "access_mode": "user",
        "grant_strategy": "authorization_code_pkce",
        "use_refresh_tokens": true,
        "refresh_token_rotation": false
      }
    }
  }
}
```

---

## Ecosystem Name

Default: `"mcp-ecosystem"`

Used in the `client_metadata.ecosystem` field on Auth0 Application objects created by the provisioner. Override it in `ecosystem-configuration.json` if you run multiple separate ecosystems against the same Auth0 tenant:

```json
{
  "ecosystem_name": "work-mcp"
}
```

---

## Minimal `ecosystem-configuration.json`

The only required field is `domain.server_host_pattern`. The `base_domain` is configured via the `ECOSYSTEM_BASE_DOMAIN` environment variable (see [Ecosystem configuration variables](#ecosystem-configuration-variables) above).

```json
{
  "domain": {
    "server_host_pattern": "{slug}-mcp.{base_domain}"
  }
}
```

Add `client_groups` when you want to grant multiple clients access to servers in bulk:

```json
{
  "domain": {
    "server_host_pattern": "{slug}-mcp.{base_domain}"
  },
  "client_groups": {
    "interactive-default": ["cursor-primary", "inspector-local"]
  }
}
```

Everything else uses hardcoded defaults unless you explicitly override it.
