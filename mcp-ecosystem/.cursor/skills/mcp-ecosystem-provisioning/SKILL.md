---
name: mcp-ecosystem-provisioning
description: Provisions and configures MCP servers and OAuth clients using the mcp-ecosystem CLI tool. Use when adding a new MCP server, creating or modifying OAuth client configurations, managing Auth0 API or client relationships, writing mcp-configuration.json or client-configuration.json files, running provisioning CLI commands, granting client access, adding scopes, or setting up Auth0 for MCP.
---

# MCP Ecosystem Provisioning

Operational playbook for the `mcp-ecosystem` CLI tool. This tool provisions and manages Auth0-backed MCP server ecosystems. For deep rationale, see [guide-and-provisioning-contract.md](../../../guide-and-provisioning-contract.md). For full config schemas, see [reference.md](reference.md).

## Tool vs Ecosystem

**The tool** lives in this repository (`mcp-ecosystem/`). It contains:
- `src/` -- TypeScript CLI and runtime library
- `package.json`, `tsconfig.json` -- build config
- `example-ecosystem/` -- a working example to reference

**An ecosystem** is a separate directory (possibly a separate repo) where a user keeps their MCP server configurations, client descriptors, and Auth0 integration state. The tool operates on an ecosystem directory via `--dir <path>`.

The tool is generic. The ecosystem is personal. Never mix tool source files with ecosystem config files.

## Core Mental Model

- **MCP server** = Auth0 API (resource server). One Auth0 API per server.
- **Software client** = Auth0 Application. One per distinct client.
- **Client grant** = links an Application to an API with specific scopes.
- **Slug** = stable, DNS-safe identity for an MCP server. Never derived from folder name.
- Everything else (hostname, resource URI, API identifier, metadata URL) is derived from slug + `ecosystem-configuration.json`.

## Ecosystem Directory Layout

Every ecosystem directory follows this structure:

```
my-ecosystem/
  ecosystem-configuration.json      # Domain pattern and client groups (slim)
  .env / .env.example               # Auth0 tenant domain and credentials
  client-descriptors/*.json          # Reusable client behavior templates
  oauth-clients/<key>/
    client-configuration.json        # Concrete Auth0 Application instances
  mcps/<slug>/
    mcp-configuration.json           # Server desired state (provisioning config)
    server.ts                        # Server implementation
```

All MCP servers live under `mcps/` to keep the top-level clean. Server implementations import from the `@scupit/mcp-ecosystem` npm package. A working example is at `example-ecosystem/` in this repository.

### Environment Variables

Auth0 configuration is via environment variables (in `.env` or shell), not in JSON config:

| Variable | Purpose |
|----------|---------|
| `AUTH0_TENANT_DOMAIN` | Auth0 tenant domain (e.g., `my-tenant.us.auth0.com`) |
| `AUTH0_MGMT_CLIENT_ID` | M2M app Client ID for Management API |
| `AUTH0_MGMT_CLIENT_SECRET` | M2M app Client Secret |
| `AUTH0_{KEY}_CLIENT_ID` | Auto-written by CLI during reconciliation |
| `AUTH0_{KEY}_CLIENT_SECRET` | Auto-written by CLI at creation time for confidential clients (write-once) |

Commands that don't need Auth0 (like `generate-artifacts`) work without these. `AUTH0_TENANT_DOMAIN` is also read by `createMcpServer()` at MCP server startup to derive auth configuration. Missing variables produce detailed error messages explaining what to set and where.

Client IDs and secrets are managed inside an auto-generated block in `.env`. The CLI reads them at startup and writes them back on flush. **Do not manually delete secret lines** — secrets are only available from Auth0 at creation time and cannot be recovered without credential rotation.

To force-use a pre-existing Auth0 Application, manually set `AUTH0_{KEY}_CLIENT_ID` in `.env` before running reconciliation. The CLI will find and reuse that application instead of creating a new one.

## Decision Tree

**New MCP server?** Follow "Add MCP Server" below.

**New OAuth client?** Follow "Add OAuth Client" below.

**Grant a client access to a server?** Add the client to `grants.client_groups` or `grants.client_overrides` in the server's `mcp-configuration.json`, then run `reconcile-server`.

**Add a scope to a server?** Run `add-scope <slug> <scope>`, or add it to `extra_scopes` in `mcp-configuration.json` and run `reconcile-server`.

**Verify Auth0 tenant?** Run `verify-tenant`.

---

## Workflow: Add MCP Server

1. Choose a DNS-safe slug: lowercase, hyphens allowed, start with letter, end with alphanumeric. Regex: `^[a-z][a-z0-9-]*[a-z0-9]$`.

2. Create `mcps/<slug>/mcp-configuration.json` in the ecosystem directory:

```json
{
  "name": "Human-Readable Name",
  "slug": "<slug>",
  "scope_profile": "standard",
  "extra_scopes": [],
  "auth0": {
    "create_api_if_missing": true,
    "existing_api_id": null
  },
  "grants": {
    "client_groups": ["interactive-default"]
  },
  "access_policy": {
    "user": "require_client_grant",
    "client": "deny_all"
  }
}
```

3. Provision and generate:

```bash
node dist/cli.js reconcile-server <slug> --dir <ecosystem-path>
```

4. Implement the server in `mcps/<slug>/server.ts`. Import from the published package:

```typescript
import { createMcpServer, mcpToolHandler } from "@scupit/mcp-ecosystem/server";

const mcp = await createMcpServer(
  import.meta.url,
  { transport: { type: "streamable-http-stateless", port: 3001 } },
  (server) => {
    server.registerTool("my-tool", { description: "..." }, mcpToolHandler(async (args) => {
      return { content: [{ type: "text", text: "result" }] };
    }));
  },
);

await mcp.begin();
```

`createMcpServer()` reads `ecosystem-configuration.json` and `mcp-configuration.json` at startup and derives the full `RuntimeConfig` (hostname, resource URI, issuer, audience, scopes) automatically.

The third argument is a synchronous `setup(server)` callback that receives the real SDK `McpServer`. Register tools, resources, and prompts here. This callback is called once per fresh server instance (per request for stateless HTTP, per session for stateful HTTP, once for stdio). Do not use async setup callbacks; they are rejected at the type level.

Always wrap MCP handler callbacks with the appropriate wrapper: `mcpToolHandler()` for tools, `mcpResourceHandler()` for resources, `mcpPromptHandler()` for prompts. Each catches thrown errors and returns the correct result shape, eliminating manual `try/catch` blocks.

There is no `.builder` property on the returned handle. The setup callback is the only configuration entry point.

See `example-ecosystem/mcps/git/server.ts` or `example-ecosystem/mcps/files/server.ts` for complete patterns.

### Derived values (never set manually)

From slug + ecosystem config:
- Hostname: `{slug}-mcp.{base_domain}`
- Resource URI / API identifier: `https://{hostname}`
- MCP endpoint: `https://{hostname}/mcp`
- Metadata URL: `https://{hostname}/.well-known/oauth-protected-resource`

### Field reference

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | Yes | -- | Display name |
| `slug` | Yes | -- | DNS-safe, stable, explicit |
| `scope_profile` | No | none | Key from `ecosystem-configuration.json > defaults.scope_profiles` |
| `extra_scopes` | No | `[]` | Server-specific scopes beyond the profile |
| `grants.client_groups` | No | `[]` | Keys from `ecosystem-configuration.json > client_groups` |
| `grants.client_overrides` | No | `{}` | `{ "<client-key>": ["scope1"] }` |
| `access_policy.user` | No | `require_client_grant` | Or `allow_all` |
| `access_policy.client` | No | `deny_all` | Or `require_client_grant` |

---

## Workflow: Add OAuth Client

1. Determine the client profile:

| Profile | Use for | Auth method | Public? |
|---------|---------|-------------|---------|
| `native_interactive` | Desktop apps, Cursor, local tools | `none` | Yes |
| `spa_interactive` | Browser frontends | `none` | Yes |
| `regular_web_interactive` | Backend web apps | `client_secret_post` | No |
| `service_m2m` | Cron jobs, daemons, workers | `client_secret_post` | No |

2. If this is a new *kind* of client, create a descriptor in `client-descriptors/<descriptor-key>.json`. If it matches an existing descriptor, reuse it.

3. Create `oauth-clients/<client-key>/client-configuration.json` in the ecosystem directory:

```json
{
  "client_key": "<client-key>",
  "display_name": "Human Name",
  "descriptor": "<descriptor-key-or-omit>",
  "profile": "<profile>",
  "auth0": {
    "create_if_missing": true
  },
  "application_settings": {
    "callback_urls": [],
    "logout_urls": [],
    "web_origins": [],
    "token_endpoint_auth_method": "none"
  },
  "token_settings": {
    "use_refresh_tokens": true,
    "refresh_token_rotation": true
  }
}
```

4. Run: `node dist/cli.js reconcile-client <client-key> --dir <ecosystem-path>`

5. Add the client to a `client_group` in `ecosystem-configuration.json`, or to individual servers' `grants`.

### Required facts per profile

**native_interactive**: callback URL(s), whether device flow needed, refresh token needs.

**spa_interactive**: callback URL(s), logout URL(s), web origins.

**regular_web_interactive**: callback URL(s), logout URL(s), auth method.

**service_m2m**: which APIs/scopes needed, secret storage env var. Set `use_refresh_tokens: false`.

If any required fact is unknown, **ask the user**. Never guess callback URLs or origins.

---

## Known Client Patterns

### Cursor

- Profile: `native_interactive`
- Callback URL: `cursor://anysphere.cursor-mcp/oauth/callback`
- Auth method: `none` (public)
- Refresh tokens: yes, with rotation
- Device flow: no

After provisioning, the user's Cursor `mcp.json` entry:

```json
{
  "mcpServers": {
    "<slug>-mcp": {
      "url": "https://<slug>-mcp.<base_domain>/mcp",
      "auth": {
        "CLIENT_ID": "${env:AUTH0_CURSOR_PRIMARY_CLIENT_ID}"
      }
    }
  }
}
```

No `CLIENT_SECRET` needed. Cursor discovers the authorization server via `/.well-known/oauth-protected-resource`.

### MCP Inspector (Local Dev)

- Profile: `native_interactive`
- Callback URL: confirm with user (typically `http://127.0.0.1:<port>/callback`)
- Auth method: `none` (public)
- Refresh tokens: yes, with rotation

---

## CLI Commands

All commands support `--dry-run`, `--verbose`, `--json`, `--dir <path>`.

| Command | Purpose |
|---------|---------|
| `verify-tenant` | Check Auth0 tenant prerequisites |
| `reconcile-client <key>` | Create or reuse Auth0 Application |
| `reconcile-server <slug>` | Reconcile Auth0 API + scopes + policy + grants |
| `reconcile-all` | Full ecosystem reconciliation |
| `add-scope <slug> <scope>` | Add scope to local config and Auth0 |
| `grant-client <slug> <key> [scopes...]` | Create or patch a client grant |
| `generate-artifacts` | Generate .env.example |

Run: `node dist/cli.js <command> --dir <ecosystem-path>`

Dev mode: `npx tsx src/cli.ts <command> --dir <ecosystem-path>`

---

## Validation Checklist

After writing any config:

- [ ] Slug is DNS-safe (`^[a-z][a-z0-9-]*[a-z0-9]$`)
- [ ] Slug is explicitly declared, not derived from folder name
- [ ] `scope_profile` references a valid key in ecosystem config
- [ ] `client_groups` reference valid keys in ecosystem config
- [ ] `client_overrides` reference valid client keys in `oauth-clients/`
- [ ] No real secrets in JSON files (only env var name references)
- [ ] `extra_scopes` contains no duplicates
- [ ] Run `generate-artifacts --dir <ecosystem-path> --dry-run` to verify .env.example generation

---

## Hard Rules

1. Never derive slug from folder name.
2. Never write live secrets into JSON config files.
3. Never guess callback URLs or web origins -- ask the user.
4. Never create an Auth0 Application for an MCP server. Servers are APIs.
5. Scope updates must send the full desired set. Auth0 removes omitted scopes.
6. M2M client access (`access_policy.client`) is `deny_all` by default. Only enable with explicit request.
7. Public clients (`native_interactive`, `spa_interactive`) use `token_endpoint_auth_method: "none"` and cannot use `client_credentials`.

## Additional Resources

- Full rationale and Auth0 mapping: [guide-and-provisioning-contract.md](../../../guide-and-provisioning-contract.md)
- Config schemas, reuse algorithm, scope model: [reference.md](reference.md)
- Working example ecosystem: `example-ecosystem/`
- Server bootstrap API: `@scupit/mcp-ecosystem/server` subpath export
- Zod validation schemas (source of truth): `src/types/`
