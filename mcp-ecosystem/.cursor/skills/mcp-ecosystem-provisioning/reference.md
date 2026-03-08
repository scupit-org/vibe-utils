# MCP Ecosystem Reference

Detailed config schemas, valid values, algorithms, and patterns. Read this when the main SKILL.md doesn't have enough detail.

---

## Tool vs Ecosystem Separation

The `mcp-ecosystem` repository contains:
- **The npm package** (`@scupit/mcp-ecosystem`): CLI provisioner, runtime helpers, and server bootstrap
- **An example ecosystem**: `example-ecosystem/` (runnable servers + complete config)
- **Documentation**: `guide-and-provisioning-contract.md`, `implementation-plan.md`

A **user's ecosystem** is a separate directory (or repo) that depends on `@scupit/mcp-ecosystem` as an npm package. It contains ecosystem config, client descriptors, OAuth client instances, and MCP server implementations under `mcps/`. The provisioning CLI operates on it via `--dir <path>`.

### npm package entry points

| Import path | Contents |
|---|---|
| `@scupit/mcp-ecosystem` | Types, config loading, Auth0 client, runtime helpers (token validation, 401 challenges) |
| `@scupit/mcp-ecosystem/server` | `createMcpServer(importMetaUrl, options?, setup?)` (requires `@modelcontextprotocol/sdk`; `express` is needed for HTTP transports). The `setup` callback receives the real SDK `McpServer` and must be synchronous. |

### Example ecosystem structure

```
example-ecosystem/
  package.json, tsconfig.json      # Build/run config for the servers
  mcps/files/                      # Files MCP (read_file, write_file)
  mcps/git/                        # Git MCP (git_status)
```

Run example servers from `example-ecosystem/`: `npm run pm2:start:http_stateless` or `npm run pm2:start:stdio`. Transport must be explicitly chosen; use `pm2 start ecosystem.config.cjs --env stdio` or `--env http_stateless`.

---

## Ecosystem Configuration Schema

File: `ecosystem-configuration.json` (ecosystem root)

Most fields are optional. The toolkit applies sensible defaults from `src/config/defaults.ts`. Auth0 tenant and credentials come from environment variables, not this file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain.base_domain` | string | No | **Deprecated in JSON config.** Set `ECOSYSTEM_BASE_DOMAIN` in `.env` instead. If present in JSON, it is used as a fallback. |
| `domain.server_host_pattern` | string | Yes | e.g. `"{slug}-mcp.{base_domain}"` |
| `ecosystem_name` | string | No | Default `"mcp-ecosystem"`. Used in Auth0 metadata. |
| `defaults.api.signing_alg` | string | No | Default `"RS256"` |
| `defaults.api.token_dialect` | string | No | Default `"rfc9068_profile_authz"` |
| `defaults.api.user_access_policy` | enum | No | `"require_client_grant"` or `"allow_all"`. Default `"require_client_grant"` |
| `defaults.api.client_access_policy` | enum | No | `"deny_all"` or `"require_client_grant"`. Default `"deny_all"` |
| `defaults.scope_profiles` | `Record<string, string[]>` | No | Merged with built-in `"readonly"` and `"standard"` profiles |
| `defaults.client_profiles` | `Record<ProfileKey, ProfileDef>` | No | Merged with built-in profiles (rarely needed) |
| `client_groups` | `Record<string, string[]>` | No | Named lists of client keys |

### Environment variables (for Auth0)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH0_TENANT_DOMAIN` | Yes (Auth0 commands) | e.g. `"your-tenant.auth0.com"` |
| `AUTH0_MGMT_CLIENT_ID` | Yes (Auth0 commands) | M2M app Client ID for Management API |
| `AUTH0_MGMT_CLIENT_SECRET` | Yes (Auth0 commands) | M2M app Client Secret |

Management audience is derived as `https://{AUTH0_TENANT_DOMAIN}/api/v2/`.

### Built-in scope profiles

- `"readonly"`: `resources.read`, `prompts.read`, `tools.read`
- `"standard"`: `resources.read`, `prompts.read`, `tools.read`, `tools.write`

### Client groups (from example ecosystem)

- `"interactive-default"`: `cursor-primary`, `inspector-local`
- `"automation-default"`: `sync-worker`

### Minimal example

```json
{
  "domain": {
    "base_domain": "example.com",
    "server_host_pattern": "{slug}-mcp.{base_domain}"
  },
  "client_groups": {
    "interactive-default": ["cursor-primary", "inspector-local"]
  }
}
```

Full defaults documentation: `docs/02-ecosystem-defaults.md`.

---

## Server Config Schema (`mcp-configuration.json`)

Validated by `ServerConfigSchema` in `src/types/server-config.ts`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Display name |
| `slug` | string | Yes | Must match `^[a-z][a-z0-9-]*[a-z0-9]$` |
| `scope_profile` | string | No | Key from `defaults.scope_profiles` |
| `extra_scopes` | string[] | No | Additional scopes unique to this server |
| `auth0.create_api_if_missing` | boolean | No | Default `true` |
| `auth0.existing_api_id` | string \| null | No | Pre-existing Auth0 API ID |
| `grants.client_groups` | string[] | No | Keys from `client_groups` |
| `grants.client_overrides` | `Record<clientKey, string[]>` | No | Per-client scope overrides |
| `access_policy.user` | enum | No | `"require_client_grant"` \| `"allow_all"` |
| `access_policy.client` | enum | No | `"deny_all"` \| `"require_client_grant"` |

### Scope resolution

Final scope set = `scope_profiles[scope_profile]` union `extra_scopes`, deduplicated.

---

## Client Config Schema (`client-configuration.json`)

Validated by `ClientConfigSchema` in `src/types/client-config.ts`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `client_key` | string | Yes | Stable unique identifier |
| `display_name` | string | Yes | Human-readable name |
| `descriptor` | string | No | Key from `client-descriptors/` |
| `profile` | enum | Yes | See profile table below |
| `auth0.create_if_missing` | boolean | Yes | Whether to create if not found |
| `application_settings.callback_urls` | string[] | No | OAuth redirect URIs |
| `application_settings.logout_urls` | string[] | No | Post-logout redirect URIs |
| `application_settings.web_origins` | string[] | No | Allowed CORS origins |
| `application_settings.token_endpoint_auth_method` | enum | No | `"none"` \| `"client_secret_post"` \| `"client_secret_basic"` \| `"private_key_jwt"` |
| `token_settings.use_refresh_tokens` | boolean | No | |
| `token_settings.refresh_token_rotation` | boolean | No | |

### Valid profiles

| Profile | Auth0 app_type | Access mode | Grant types | Auth method |
|---------|---------------|-------------|-------------|-------------|
| `native_interactive` | `native` | `user` | `authorization_code`, `refresh_token`, optionally `device_code` | `none` |
| `spa_interactive` | `spa` | `user` | `authorization_code`, `refresh_token` | `none` |
| `regular_web_interactive` | `regular_web` | `user` | `authorization_code`, `refresh_token` | `client_secret_post` |
| `service_m2m` | `non_interactive` | `machine` | `client_credentials` | `client_secret_post` |

---

## Client Descriptor Schema (`client-descriptors/*.json`)

Validated by `ClientDescriptorSchema` in `src/types/client-descriptor.ts`.

A descriptor defines how a *kind* of software integrates. Multiple concrete clients can reference one descriptor.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `descriptor_key` | string | Yes | Unique identifier |
| `display_name` | string | Yes | |
| `profile` | enum | Yes | Same as client config profiles |
| `access_mode` | enum | Yes | `"user"` \| `"machine"` |
| `supports_pkce` | boolean | No | |
| `supports_device_flow` | boolean | No | |
| `requires_refresh_tokens` | boolean | No | |
| `requires_refresh_token_rotation` | boolean | No | |
| `callback_urls` | string[] | No | Default callback URLs for this kind |
| `logout_urls` | string[] | No | |
| `web_origins` | string[] | No | |
| `reuse_policy` | enum | No | Default `"share_if_exact_match"` |

### Reuse policies

| Policy | Behavior |
|--------|----------|
| `share_if_exact_match` | Reuse only when all settings match exactly |
| `patch_if_safe` | Reuse and add missing URLs/settings if safe |
| `never_share` | Always create a dedicated Auth0 Application |

Default by client type:
- First-party tools: `patch_if_safe`
- Third-party software: `share_if_exact_match`
- M2M automation: `never_share`

---

## Auto-managed env vars

The CLI manages client IDs and secrets inside an auto-generated block in `.env`:

| Variable pattern | Written when | Semantics |
|---|---|---|
| `AUTH0_{KEY}_CLIENT_ID` | Client reconciled (created or reused) | Always updated |
| `AUTH0_{KEY}_CLIENT_SECRET` | Confidential client created | Write-once: never overwritten if already present |

`{KEY}` is derived from `client_key` via `toUpperCase().replace(/-/g, "_")`. For example, `sync-worker` → `AUTH0_SYNC_WORKER_CLIENT_ID`.

**Escape hatch:** To force-use a pre-existing Auth0 Application, manually set `AUTH0_{KEY}_CLIENT_ID` in `.env` before running reconciliation.

**Warning:** Manually deleting a secret line from `.env` is unrecoverable without rotating the credential in the Auth0 Dashboard.

---

## Application Reuse Algorithm

The provisioner first checks `AUTH0_{KEY}_CLIENT_ID` from the environment. If set, it fetches that application by ID directly. Otherwise, it searches for existing Auth0 Applications by `client_metadata.client_key`. An existing application is compatible only if ALL of these hold:

1. Same client profile
2. Same access mode (`user` / `machine`)
3. Same Auth0 application type
4. Same `token_endpoint_auth_method`
5. All required callback URLs are present
6. All required logout URLs are present
7. All required web origins are present
8. Token settings are compatible
9. Reuse policy allows it

If compatible: reuse (and optionally patch if policy is `patch_if_safe`).
If not compatible: create a new Auth0 Application.

The provisioner tags every created application with `client_metadata`:

```json
{
  "ecosystem": "<ecosystem_name>",
  "client_key": "<client_key>",
  "descriptor": "<descriptor_key>",
  "profile": "<profile>",
  "managed_by": "@scupit/mcp-ecosystem"
}
```

---

## Grant Resolution

For a server, the grant targets are computed as:

1. Expand each `client_groups` entry into its member client keys
2. Each group member gets the server's full scope set
3. `client_overrides` replace (not merge) the scope set for that specific client
4. Subject type is `"user"` for interactive profiles, `"client"` for `service_m2m`
5. M2M grants are skipped if `access_policy.client` is `deny_all`

Grants are matched in Auth0 by `client_id + audience + subject_type`. The provisioner creates or patches as needed.

---

## Auth0 Object Mapping

| Ecosystem concept | Auth0 object | Identifier |
|-------------------|-------------|------------|
| MCP server | API (Resource Server) | Canonical resource URI |
| Software client | Application | `client_id` |
| Client-server permission | Client Grant | `client_id + audience + subject_type` |
| Authorization server | Tenant | `tenant_domain` |

### Auth0 API shape created by provisioner

```json
{
  "name": "<server name>",
  "identifier": "https://<slug>-mcp.<base_domain>",
  "signing_alg": "RS256",
  "token_dialect": "rfc9068_profile_authz",
  "enforce_policies": true,
  "scopes": [
    { "value": "resources.read", "description": "Read MCP resources" },
    { "value": "tools.write", "description": "Execute mutating tools" }
  ]
}
```

### Access policy applied

```json
{
  "user": { "policy": "require_client_grant" },
  "client": { "policy": "deny_all" }
}
```

---

## Scope Model

### Baseline scopes (used across all servers)

| Scope | Description |
|-------|-------------|
| `resources.read` | Read MCP resources |
| `prompts.read` | Read MCP prompts |
| `tools.read` | Execute read-only tools |
| `tools.write` | Execute mutating tools |

### Server-specific scopes (examples from example-ecosystem)

| Scope | Server |
|-------|--------|
| `files.index` | files |
| `files.delete` | files |
| `git.commit` | git |

Add server-specific scopes via `extra_scopes` in `mcp-configuration.json`.

### Scope reconciliation rule

Auth0 treats a scope PATCH as a full replacement. Omitted scopes are removed. The provisioner always computes the complete desired scope set before sending it to Auth0.

---

## MCP Runtime Contract

Each MCP server must implement at runtime (the `src/mcp-runtime/` module provides helpers):

### Protected Resource Metadata

Serve at `/.well-known/oauth-protected-resource`:

```json
{
  "resource": "https://<slug>-mcp.<base_domain>",
  "authorization_servers": ["https://<tenant_domain>/"]
}
```

Use `protectedResourceMetadataHandler()` from `@scupit/mcp-ecosystem`.

### 401 Challenge

On missing/invalid/insufficient token:

```
WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource", scope="tools.read"
```

Use `send401Challenge()` or `createAuthMiddleware()` from `@scupit/mcp-ecosystem`.

### Token Validation

Validate: RS256 signature via JWKS, issuer, audience, expiration, scopes/permissions.

Use `TokenValidator` from `@scupit/mcp-ecosystem`.

### Scope Enforcement

Use `requireScopes(['tools.write'])` middleware for per-route enforcement.

---

## Existing Example Configurations

### Client descriptors (in `client-descriptors/`)

| Key | Profile | Callback URL |
|-----|---------|-------------|
| `cursor-like` | `native_interactive` | `cursor://anysphere.cursor-mcp/oauth/callback` |
| `inspector-local` | `native_interactive` | `http://127.0.0.1:6274/callback` |
| `service-worker` | `service_m2m` | (none) |

### Concrete clients (in `oauth-clients/`)

| Key | Descriptor | Profile |
|-----|-----------|---------|
| `cursor-primary` | `cursor-like` | `native_interactive` |
| `inspector-local` | `inspector-local` | `native_interactive` |
| `sync-worker` | `service-worker` | `service_m2m` |

### Servers (in `mcps/`)

| Slug | Scope profile | Extra scopes | Tools | Default port |
|------|--------------|-------------|-------|-------------|
| `files` | `standard` | `files.index`, `files.delete` | `read_file`, `write_file` | 3002 |
| `git` | `standard` | `git.commit` | `git_status` | 3001 |
