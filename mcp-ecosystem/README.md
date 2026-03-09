# @scupit/mcp-ecosystem

> **NOTE: This is a vibe coding experiment!** For learning purposes, I wanted a convenient personal tool
> to simplify the process of spinning up new MCP servers with OAuth support. I had some monthly credits left,
> and decided to see how well AI could handle a project like this. **Use at your own discretion!**

Provisioning CLI, runtime library, and server bootstrap for building a personal [MCP](https://modelcontextprotocol.io/) ecosystem that uses [Auth0](https://auth0.com/) for OAuth support.

## What this is

> **Vibe coded software!** That includes the README. If this tool becomes useful enough to me, I'll do a
> human pass through the README. Until then, just know it's AI generated.

This toolkit solves a specific problem: you want to run many MCP servers, each on its own subdomain, each protected by OAuth via Auth0, and you don't want to manually configure Auth0 objects or re-derive security plumbing every time you add a new one.

The package gives you three things:

1. **A provisioning CLI** that reconciles your desired-state config files against Auth0, creating or updating APIs, Applications, and client grants as needed.
2. **A server bootstrap** that derives runtime config at startup, selects the requested MCP transport, and wires in Protected Resource Metadata plus bearer-token validation for HTTP transports.
3. **Runtime helpers** for token validation, scope enforcement, and `WWW-Authenticate` challenge generation that any MCP server can use directly.

## How it works

The system maps OAuth roles to Auth0 objects:

- Each **MCP server** is an Auth0 **API** (resource server)
- Each **software client** (Cursor, a CLI tool, a web app) is an Auth0 **Application**
- Each **client-server permission** is an Auth0 **client grant** with specific scopes
- Your **Auth0 tenant** is the authorization server

You describe your desired state in JSON config files inside an **ecosystem directory**. The CLI reads those files, talks to the Auth0 Management API, and makes reality match. Your MCP servers then derive their runtime configuration directly from those source files and environment variables at startup via `createMcpServer()`.

```text
my-ecosystem/
  ecosystem-configuration.json       # Domain pattern, client groups
  .env                               # Auth0 tenant domain and credentials
  client-descriptors/                # Reusable client behavior templates
    cursor-like.json
  oauth-clients/                     # Concrete Auth0 Application instances
    cursor-primary/
      client-configuration.json
  mcps/                              # MCP server configs and implementations
    files/
      mcp-configuration.json         # Desired state for this server
      server.ts                      # Server implementation
```

## Quick start

### Install

```bash
npm install @scupit/mcp-ecosystem
```

For MCP servers, also install the peer dependencies:

```bash
npm install express @modelcontextprotocol/sdk zod
```

### Set up an ecosystem directory

Create `ecosystem-configuration.json` with your domain pattern:

```json
{
  "domain": {
    "server_host_pattern": "{slug}-mcp.{base_domain}"
  },
  "client_groups": {
    "interactive-default": ["cursor-primary"]
  }
}
```

That's the entire config file. The `{base_domain}` placeholder is resolved from the `ECOSYSTEM_BASE_DOMAIN` environment variable in your `.env` file. Do not put `domain.base_domain` in `ecosystem-configuration.json`; deployment-specific domains belong in env. API settings, scope profiles, and client profiles all have sensible [built-in defaults](docs/02-ecosystem-defaults.md) that you only override when needed.

Create a root `.env` file with your ecosystem base domain and Auth0 credentials, or export the same variables in your shell:

```dotenv
ECOSYSTEM_BASE_DOMAIN=example.com
AUTH0_TENANT_DOMAIN=your-tenant.auth0.com
AUTH0_MGMT_CLIENT_ID=your-management-client-id
AUTH0_MGMT_CLIENT_SECRET=your-management-client-secret
```

Not all of these variables are used by all parts of the system. During `createMcpServer()` bootstrap, the toolkit removes Auth0 management credentials and auto-generated client credentials from `process.env`, while leaving the shared runtime variables (`ECOSYSTEM_BASE_DOMAIN`, `AUTH0_TENANT_DOMAIN`, `PORT`, and user-defined vars) available to the server. See [Environment Variables](docs/02-ecosystem-defaults.md#environment-variables) for the full breakdown and the exact bootstrap boundary.

To bootstrap that file, run `npx mcp-ecosystem generate-artifacts --dir ./my-ecosystem`. It refreshes a managed block in `.env.example` using placeholder values only and preserves any comments or custom example variables you keep outside that block.

Replace the placeholder values before running provisioning or authenticated server startup. Placeholder values like `example.com`, `your-tenant.auth0.com`, and `__REQUIRED__` are treated as invalid configuration.

Per-server `.env` files are supported for server-local overrides like `PORT`, but they must not redefine shared ecosystem/Auth0 variables such as `ECOSYSTEM_BASE_DOMAIN`, `AUTH0_TENANT_DOMAIN`, or Auth0 client credentials. Those belong in the ecosystem root `.env`.

Auto-generated `AUTH0_{KEY}_CLIENT_ID` and `AUTH0_{KEY}_CLIENT_SECRET` entries are tool-owned and must live only inside the root `.env` managed block. If they appear in user-authored content outside that block, reconciliation fails with a corrective error.

### Verify your Auth0 tenant

```bash
npx mcp-ecosystem verify-tenant --dir ./my-ecosystem
```

This checks that Resource Parameter Compatibility Profile is enabled (required for MCP's `resource` parameter to work with Auth0).

### Add an MCP server

Create `mcps/my-server/mcp-configuration.json`:

```json
{
  "name": "My Server",
  "slug": "my-server",
  "scope_profile": "standard",
  "auth0": { "create_api_if_missing": true },
  "grants": { "client_groups": ["interactive-default"] },
  "access_policy": { "user": "require_client_grant", "client": "deny_all" }
}
```

Provision it:

```bash
npx mcp-ecosystem reconcile-server my-server --dir ./my-ecosystem
```

### Write the server

```typescript
import {
  createMcpServer,
  mcpToolHandler,
  streamableHttpStatelessTransport,
} from "@scupit/mcp-ecosystem/server";
import { z } from "zod";

const mcp = await createMcpServer(
  import.meta.url,
  {
    transport: streamableHttpStatelessTransport({ port: 3000 }),
  },
  (server, _context) => {
    server.registerTool(
      "hello",
      {
        description: "Say hello",
        inputSchema: { name: z.string() },
      },
      mcpToolHandler(async ({ name }) => {
        return {
          content: [{ type: "text", text: `Hello, ${name}!` }],
        };
      })
    );
  }
);

await mcp.begin();
```

This gives you:

- `/.well-known/oauth-protected-resource` -- MCP-required metadata discovery
- `/mcp` -- Streamable HTTP MCP endpoint with bearer token validation
- `/health` -- health check

## CLI commands

All commands support `--dry-run`, `--verbose`, `--json`, and `--dir <path>`.

| Command | What it does |
| --- | --- |
| `verify-tenant` | Checks Auth0 tenant prerequisites (Resource Parameter Compatibility Profile, DCR status) |
| `reconcile-client <key>` | Creates or reuses an Auth0 Application for a software client |
| `reconcile-server <slug>` | Reconciles the Auth0 API, scopes, access policy, and client grants for an MCP server |
| `reconcile-all` | Full ecosystem reconciliation: tenant, then all clients, then all servers |
| `add-scope <slug> <scope>` | Adds a scope to local config and updates the Auth0 API |
| `grant-client <slug> <key> [scopes...]` | Creates or updates a client grant for a specific client/server pair |
| `generate-artifacts` | Refreshes the managed `.env.example` block with placeholders |

## Package exports

### `@scupit/mcp-ecosystem`

The main entry point. Types, config loading, Auth0 Management API client, and lightweight runtime helpers (token validation, scope enforcement, `WWW-Authenticate` challenges). No heavy dependencies.

### `@scupit/mcp-ecosystem/server`

The server bootstrap. `@modelcontextprotocol/sdk` is required. `express` is required for the HTTP transports and optional for `stdio`. Provides:

- `createMcpServer(importMetaUrl, options, setup)` -- loads config from source files, derives runtime env/config, creates the selected MCP transport, and returns a lifecycle handle with `.config`, `.begin()`, and `.stop()`. Both `options` and `setup` are required.

The `setup` callback receives `(server, context)`: the real SDK `McpServer` instance and an `McpServerContext` that carries auth configuration. Use `context.retrieveAuthData(extra)` in tool/resource/prompt handlers to get user identity for user-scoped storage; when auth is disabled, it returns `{ isAuthEnabled: false }` and you can use a constant like `"local"` as the storage key. Setup is called once per fresh server instance: once per request for stateless HTTP, once per session for stateful HTTP, and once per process for stdio. Setup must be synchronous; async setup callbacks are rejected at the type level.

For HTTP transports, auth is enabled by default. For local development without Auth0, pass `streamableHttpStatelessTransport({ port: portFromEnvOr(3000), auth: { enabled: false } })` or the equivalent stateful transport config. `stdio` has no HTTP auth layer.

**Transport selection:** Use `resolveTransportSelection()` when you want to support multiple transports (e.g. stdio for local CLI and HTTP for remote clients). Resolution order: (1) `selectedTransport` override, (2) `--transport=<name>` CLI flag, (3) `MCP_TRANSPORT` env var. No default or auto-selection; explicit selection is required. Accepted values: `stdio`, `streamable_http_stateless`, `streamable_http_stateful`, or hyphenated variants (`streamable-http-stateless`, `streamable-http-stateful`).

HTTP transports bind to `127.0.0.1` by default. Set `host: "0.0.0.0"` in the transport config only for intentional network exposure behind a reverse proxy. Origin validation is enabled by default and rejects all browser `Origin` headers unless you configure a custom origin validator via the `origin` transport config field. See [MCP Server Runtime Lifecycle](docs/04-mcp-server-runtime-lifecycle.md) for full details.

Shutdown is initiated through `server.close()`, which closes the active transport internally. Stateless mode tracks active in-flight request servers so `stop()` can terminate them. Stateful mode stores per-session server+transport pairs and closes them through the server on shutdown.

The current server bootstrap assumes a single ecosystem/server context per Node process. If you need to host multiple different ecosystem contexts in one process, do not rely on the current `process.env` loading behavior to isolate them.

OAuth client `client_key` values must be env-safe slugs: lowercase, start with a letter, may contain digits or hyphens, and end with an alphanumeric character. This keeps the generated `AUTH0_{KEY}_CLIENT_ID` / `AUTH0_{KEY}_CLIENT_SECRET` variables valid and collision-free.

## Auth model

The provisioner enforces these defaults (configurable per server):

- **User access**: `require_client_grant` -- interactive clients need an explicit grant to call the API
- **M2M access**: `deny_all` -- machine-to-machine access is blocked unless you explicitly enable it
- **Token format**: `rfc9068_profile_authz` -- access tokens include the `permissions` claim
- **Signing**: RS256 via Auth0 JWKS

Each MCP server validates tokens at runtime by checking the RS256 signature, issuer, audience, and scopes. Invalid or missing tokens get a proper `WWW-Authenticate` challenge pointing to the server's Protected Resource Metadata.

**Auth context in handlers:** The auth middleware shapes `req.auth` as the SDK's `AuthInfo` type (with the Auth0 `sub` claim in `extra.sub`). The SDK passes this through as `extra.authInfo` to every tool, resource, and prompt handler. Use `context.retrieveAuthData(extra)` from the setup callback's `context` to get user identity — it returns a tagged union discriminated by `isAuthEnabled`. When auth is enabled, use `auth.sub` as the storage key for user-scoped data (never `clientId`, which identifies the OAuth application and would fragment a user's data across Cursor, Claude Code, etc.). When auth is disabled, `retrieveAuthData` returns `{ isAuthEnabled: false }`; use a constant like `"local"` as the storage key since auth-disabled transports are single-user by definition.

## Client profiles

Four built-in profiles cover the standard OAuth application types:

| Profile | For | Auth method | Public? |
| --- | --- | --- | --- |
| `native_interactive` | Desktop apps (Cursor), local tools | `none` | Yes |
| `spa_interactive` | Browser frontends | `none` | Yes |
| `regular_web_interactive` | Backend web apps | `client_secret_post` | No |
| `service_m2m` | Cron jobs, daemons, workers | `client_secret_post` | No |

## Example ecosystem

The `example-ecosystem/` directory contains a complete working example with:

- Four MCP servers: **Git** (`git_status` tool), **Files** (`read_file`, `write_file` tools), **All-in-one** (tools, resources, prompts), and **Live Monitor** (stateful, user-scoped task storage with `start_task`, `check_progress`, `retrieve_result`, `stop_task`, `list_tasks` — demonstrates `context.retrieveAuthData()` and works with auth disabled using `"local"` as the storage key)
- Three client descriptors: Cursor, MCP Inspector, service worker
- Three concrete client configs
- Full ecosystem configuration

Run the example servers with [PM2](https://pm2.keymetrics.io/). Transport must be explicitly chosen:

```bash
cd example-ecosystem
npm install
npm run pm2:start:http_stateless   # Git, Files, All-in-one (streamable_http_stateless)
npm run pm2:start:http_stateful    # Live Monitor (streamable_http_stateful)
npm run pm2:start:stdio            # All 4 servers (stdio)
npm run pm2:status                 # List running processes
npm run pm2:logs         # Stream logs from all servers
npm run pm2:stop         # Stop all servers
npm run pm2:delete       # Remove from PM2 (use after stop to fully clean up)
npm run pm2:restart      # Restart all servers
```

Use `--env` to select the transport (platform-agnostic; required — running without `--env` will fail). Servers that don't support the chosen transport will crash; the rest run normally.

```bash
pm2 start ecosystem.config.cjs --env http_stateless
pm2 start ecosystem.config.cjs --env http_stateful
pm2 start ecosystem.config.cjs --env stdio
```

To install the latest PM2: `npm install pm2 --save-dev` (in `example-ecosystem/`).

## Connecting Cursor

After provisioning a server and its Cursor client, add this to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "url": "https://my-server-mcp.example.com/mcp",
      "auth": {
        "CLIENT_ID": "${env:AUTH0_CURSOR_PRIMARY_CLIENT_ID}"
      }
    }
  }
}
```

Cursor discovers the authorization server automatically via `/.well-known/oauth-protected-resource`. No client secret is needed for public (native) clients.

## Project structure

```text
@scupit/mcp-ecosystem/
  src/
    cli.ts                  # CLI entry point
    index.ts                # Main package exports
    auth0/                  # Auth0 Management API client
    commands/               # CLI command implementations
    config/                 # Config loading, validation, derivation
    mcp-runtime/            # Token validation, auth middleware, 401 challenges
    mcp-server/             # Server bootstrap (Express + MCP SDK)
    types/                  # Zod schemas and TypeScript types
    utils/                  # Logger, context helpers
  example-ecosystem/        # Working example
  docs/                     # Additional documentation
```

## Documentation

- [Guide and Provisioning Contract](docs/original-guide-and-provisioning-contract.md) -- the full specification this system implements
- [Updates to Guide](docs/01-updates-to-guide.md) -- every deviation from the original spec, with rationale
- [Ecosystem Defaults](docs/02-ecosystem-defaults.md) -- all hardcoded defaults, with override examples
- [Managed Env And Reconciliation Lifecycle](docs/03-managed-env-and-reconciliation-lifecycle.md) -- how `.env`, `.env.example`, client caches, and bootstrap fit together
- [MCP Server Runtime Lifecycle](docs/04-mcp-server-runtime-lifecycle.md) -- server factory model, transport lifecycles, shutdown semantics, error handling, origin validation, and host binding
- [Implementation Plan](docs/original-implementation-plan.md) -- the phased plan used to build the system

## Requirements

- Node.js >= 20
- An Auth0 tenant with a Management API application (client credentials grant)
- Resource Parameter Compatibility Profile enabled on the tenant
