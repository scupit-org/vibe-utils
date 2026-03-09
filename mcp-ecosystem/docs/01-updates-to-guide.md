# Updates to the Guide and Provisioning Contract

This document records every deviation between the original `guide-and-provisioning-contract.md` specification and the actual implementation in `@scupit/mcp-ecosystem`. Each entry explains what the guide said, what we did instead, and why.

The guide itself has been partially updated (sections 6, 7.4, 20.3) to reflect structural changes, but the rest of the guide remains as-written. This document is the canonical record of all differences.

---

## Structural / architectural changes

### 1. Tool vs ecosystem separation

**Guide assumed:** A single repository where the provisioning script and ecosystem config files live together.

**Implementation:** The toolkit is an npm package (`@scupit/mcp-ecosystem`) with its own `src/`, `package.json`, and `dist/`. User ecosystem configs live in a completely separate directory. The CLI operates on an ecosystem via `--dir <path>`.

**Why:** Making the tool reusable across many ecosystems required separating the tool from the data it operates on. The tool is generic and publishable; ecosystem configs are personal and portable. An `example-ecosystem/` directory in the repo demonstrates the expected layout.

### 2. MCP servers live under `mcps/`

**Guide originally said (section 6):** Server folders at the ecosystem root (`files/`, `git/`, `calendar/`).

**Implementation:** All server directories are under `mcps/` (`mcps/files/`, `mcps/git/`).

**Why:** The flat layout becomes unworkable with more than a handful of servers. Client descriptors and OAuth client folders are already namespaced (`client-descriptors/`, `oauth-clients/`), so servers should be too. The guide's section 6, 7.4, and 20.3 have been updated to reflect this.

### 3. Runtime config derived at startup (no generated file)

**Guide said (section 16 Phase 5):** "Generate any runtime config file your MCP server needs" without specifying a format.

**Implementation:** Rather than generating a static `runtime-config.generated.json` file, `createMcpServer(import.meta.url)` derives the `RuntimeConfig` at startup by reading the source configs (`ecosystem-configuration.json` + `mcp-configuration.json`) and applying the standard derivation functions internally.

**Why:** A generated file is an unnecessary intermediary — it introduces staleness risk (ecosystem config changes but `generate-artifacts` isn't re-run) and bakes deployment-dependent values (tenant domain) into files. Since the toolkit already exports the derivation functions and the MCP servers already depend on the toolkit, deriving at startup is simpler, always fresh, and eliminates a whole class of "forgot to regenerate" bugs.

### 4. Server bootstrap as `@scupit/mcp-ecosystem/server`

**Guide said (section 14):** The MCP server must implement Protected Resource Metadata, 401 challenges, and token validation. No reusable bootstrap was specified.

**Implementation:** `createMcpServer()` wires the selected MCP transport, Protected Resource Metadata, and auth/runtime bootstrap into a single function call. Exported as a subpath import: `import { ... } from "@scupit/mcp-ecosystem/server"`.

**Why:** Every MCP server needs the same HTTP boilerplate, auth middleware, and metadata endpoint. Extracting this into the package prevents copy-paste drift and makes new server creation a 10-line file.

---

## Auth0 provisioning changes

### 5. `managed_by` metadata value

**Guide said (section 18):** `managed_by = mcp-ecosystem-script`

**Implementation:** `managed_by = @scupit/mcp-ecosystem`

**Why:** The guide was written before the package was scoped. Using the real package name makes the metadata tag more useful for identifying which tool owns the Auth0 objects.

### 6. Access policy reconciliation is direct

**Guide said (section 12.2):** "Immediately reconcile API access policy" to `subject_type_authorization` values.

**Implementation:** Sends `subject_type_authorization` directly in the Auth0 Management API update for the resource server.

**Why:** The current implementation treats access policy as part of normal desired-state reconciliation and updates it through the Management API alongside the other API settings.

### 7. Management token scope verification not proactive

**Guide said (sections 9.3, 15.2):** "Verify it has enough scopes for the operations it plans to perform" and "fail fast if required scopes are missing."

**Implementation:** Acquires a Management API token but does not introspect its scopes before use. If a scope is missing, Auth0 returns a 403 which surfaces as an `Auth0ApiError`.

**Why:** Token introspection would require decoding the management JWT and mapping each planned operation to its required Auth0 scope, which is non-trivial. The current behavior is functionally correct -- missing scopes produce clear errors -- but it's reactive rather than proactive.

### 8. Authentication flow

**Guide said (section 16 Phase 1):** "Authenticate to Management API" as a discrete step.

**Implementation:** `verifyTenant()` owns its own `authenticate()` call internally. Other commands trigger auto-authentication via `ensureAuthenticated()` in the Management client, which re-authenticates when the token is expired or absent.

**Why:** The token auto-refresh mechanism makes explicit authentication calls mostly unnecessary. `verifyTenant` is the only function that explicitly calls `authenticate()` because it's the natural first-contact point with Auth0.

---

## Data model changes

### 9. Cursor callback URL corrected

**Guide said (section 7.2):** `http://127.0.0.1:45123/callback` as the callback URL for the cursor-like descriptor.

**Implementation:** `cursor://anysphere.cursor-mcp/oauth/callback`

**Why:** The guide's URL was a placeholder. Cursor's documentation specifies a fixed redirect URI using the `cursor://` custom scheme. Corrected after cross-referencing with Cursor's actual MCP client documentation.

### 10. Single-character slugs allowed

**Guide said (section 7.4):** "Slug should be DNS-safe, lowercase, and hyphenated" with no explicit minimum length beyond "explicitly supplied."

**Implementation:** Regex `^[a-z]([a-z0-9-]*[a-z0-9])?$` allows single characters like `a`.

**Why:** A DNS label can be a single character. There's no reason to artificially require 2+ characters.

---

## Guide features not implemented

### 11. No `--apply` mode distinction

**Guide said (section 16 Phase 5):** "The script should never silently overwrite human-edited custom fields unless it is operating in an explicit `--apply` or reconciliation mode."

**Implementation:** Every run is a reconciliation. The `--dry-run` flag provides the safety valve.

**Why:** The reconciliation-by-default approach is simpler and matches how the tool is actually used. Adding a separate `--apply` mode would add complexity without clear benefit for a personal ecosystem tool.

### 12. `add-scope` does not auto-patch grants

**Guide said (section 21.5):** "Optionally patch grants if the new scope should be granted to specific clients."

**Implementation:** `add-scope` updates local config and Auth0 API scopes but does not automatically add the new scope to existing client grants.

**Why:** Automatically adding a new scope to grants is a policy decision that shouldn't be implicit. The user should explicitly run `grant-client` or `reconcile-server` to update grants.

### 13. No explicit drift detection report

**Guide said (section 17 Rule 3):** "Treat local config as the desired state" (implies drift detection).

**Implementation:** Reconciles toward the desired state but doesn't produce a separate drift report.

**Why:** Reconciliation *is* drift correction. The `--dry-run` mode partially serves the "show me what's different" purpose. A dedicated drift report command would be a useful future addition.

---

## Features added beyond the guide

### 14. `generate-artifacts` as a standalone command

**Guide said:** Artifact generation is part of the Phase 5 workflow.

**Implementation:** First-class CLI command that works without Auth0 credentials.

**Why:** Generating `.env.example` is useful independently of Auth0 provisioning, especially during initial setup.

### 15. Auth opt-out for local development

**Guide said (section 14):** MCP servers must validate tokens (no opt-out mentioned).

**Implementation:** `createMcpServer()` accepts `{ transport: { ..., auth: { enabled: false } } }` to skip token validation for local development on HTTP transports.

**Why:** Local development and testing require running servers without a real Auth0 tenant. The startup banner prints a warning when auth is disabled.

### 16. Management token auto-refresh

**Guide said (section 9.3):** "Obtain a Management API access token before any provisioning operation."

**Implementation:** The Management client stores `expires_in` from the token response and automatically re-authenticates when the token is expired or within 60 seconds of expiry.

**Why:** Long-running `reconcile-all` operations could outlive the token's TTL. Auto-refresh prevents silent failures partway through.

### 17. `client_id` write-back to local config

**Guide said (section 16 Phase 2 step 6):** "Persist `existing_client_id` or created `client_id` back into local config if desired."

**Implementation:** After creating or reusing an Auth0 Application, the `client_id` is written to the root `.env` managed block so subsequent runs use a direct lookup.

**Why:** Without write-back, every run searches Auth0 by metadata. With the managed `.env` cache, the second run is a fast direct fetch while keeping the value in a tool-owned location.

### 18. Stale grant cleanup

**Guide said (section 16 Phase 4 step 5):** "Optionally remove stale grants that are no longer declared."

**Implementation:** After reconciling grants, `reconcile-server` lists existing grants for the audience and removes any that aren't in the desired set.

**Why:** Without cleanup, removing a client from a group leaves the old grant lingering in Auth0.

### 19. Cursor Agent Skill

**Guide said (section 20):** "Exact guidance for an AI coding agent" as prose within the guide.

**Implementation:** Distilled into a Cursor Agent Skill at `.cursor/skills/mcp-ecosystem-provisioning/` with `SKILL.md` (192 lines) and `reference.md` (detailed schemas). Includes decision trees, field references, known client patterns (Cursor's actual callback URL, `mcp.json` format), and the real import paths.

**Why:** The guide is 1400 lines of justification-heavy prose optimized for human understanding. The skill is a concise, codebase-aware operational playbook optimized for agent execution.

### 20. Slim ecosystem config with hardcoded defaults and env vars

**Guide said (sections 7.1, 9.3):** `ecosystem-configuration.json` must contain `schema_version`, `ecosystem_name`, the full `auth0` block (tenant domain, management audience, env var names, verify flag), the full `defaults` block (API settings, scope profiles, client profiles), and `client_groups`.

**Implementation:** The config file now contains only `domain` (required) and optionally `client_groups`, `ecosystem_name`, and `defaults` overrides. Auth0 tenant identity (`AUTH0_TENANT_DOMAIN`) and Management API credentials (`AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET`) are environment variables. The management audience is derived from the tenant domain. All API settings, scope profiles, and client profiles are hardcoded in `src/config/defaults.ts` and merged with any user overrides at load time.

**Why:** The original config file was 75 lines, of which ~6 were real configuration and the rest were restating the guide's non-negotiable defaults. For a toolkit whose purpose is making MCP creation cheap and repeatable, requiring users to maintain a large boilerplate config file works against the goal. Secrets and tenant identity belong in environment variables, not JSON. The hardcoded defaults are documented in `docs/02-ecosystem-defaults.md`.

### 29. `use_trailing_slash` for API identifier and resource URI

**Guide said:** Not addressed. The guide assumes a single canonical format for the Auth0 API identifier.

**Implementation:** Added `defaults.api.use_trailing_slash` (default `"both"`) and per-server override `auth0.use_trailing_slash`. Values: `"never"` (single API without slash), `"always"` (single API with slash), `"both"` (two Auth0 APIs; server accepts tokens for either audience). Reconcile, grant-client, and add-scope use `deriveResourceUris()` and operate on all identifiers.

**Why:** Auth0 compares the OAuth `resource` parameter to the API identifier as an exact string. Cursor and possibly other clients send the resource URI with a trailing slash. A mismatch causes Auth0 to reject the authorization request with `access_denied`. The default `"both"` creates two APIs so tokens work regardless of client format.

---

## Runtime architecture changes (added in McpServer reuse fix session)

### 21. Setup callback replaces builder proxy

**Guide said (section 14):** MCP servers must implement token validation and metadata. No specific server configuration API was prescribed.

**Initial implementation:** `createMcpServer()` returned a handle with a `.builder` property — a custom recording proxy that captured `registerTool()` / `registerResource()` / `registerPrompt()` calls and replayed them onto each fresh `McpServer` instance.

**Current implementation:** `createMcpServer()` accepts a required third argument: `setup(server, context)`, a synchronous callback that receives the real SDK `McpServer` instance and an `McpServerContext`. The context exposes `context.isAuthEnabled` and `context.retrieveAuthData(extra)` for user-scoped storage keys. The recording proxy / `McpServerBuilder` / `McpServerRecorder` abstraction has been removed entirely.

**Why:** The recording proxy required mirroring the SDK's registration method signatures, introduced replay correctness risks (including detached-method `this` binding issues), and generated disproportionate type complexity. The setup-callback model is simpler, gives callers direct SDK access, and avoids maintaining a custom registration system.

### 22. Fresh McpServer per HTTP request/session

**Guide said (section 14):** MCP servers must validate tokens. No server instance lifecycle was prescribed.

**Initial implementation:** A single shared `McpServer` instance was created once in `createMcpServer()` and reused across all HTTP requests and sessions.

**Current implementation:** HTTP transports create a fresh `McpServer` instance at the correct lifecycle boundary:
- **Stateless HTTP:** one `McpServer` per request.
- **Stateful HTTP:** one `McpServer` per session.
- **Stdio:** one `McpServer` per process (unchanged).

**Why:** The MCP SDK security advisory (GHSA-345p-7cg4-v4c7) explicitly identifies reusing a single `McpServer` across multiple transports as unsafe, because `connect()` overwrites the server's internal transport reference. The corrected lifecycle prevents cross-request and cross-session message misrouting.

### 23. Origin validation on HTTP transports

**Guide said (section 14):** MCP servers must validate tokens. Origin validation was not mentioned.

**Implementation:** `buildHttpApp()` now validates the `Origin` header on `/mcp` before auth middleware. The default policy rejects all browser origins (`denyAllOrigins()`). Configurable via the `origin` field in the HTTP transport config, with pre-built helpers: `denyAllOrigins()`, `allowLocalOrigins()`, `allowOrigins([...])`.

**Why:** The MCP spec requires origin validation for Streamable HTTP to prevent DNS rebinding attacks. Without it, a malicious website could drive a local MCP server through the user's browser.

### 24. Localhost-default host binding

**Guide said:** Not addressed.

**Implementation:** HTTP transports now default to binding on `127.0.0.1` (loopback only). Broader binding like `0.0.0.0` requires explicit opt-in via the `host` transport config field. The startup banner prints the actual bound address.

**Why:** The MCP spec recommends localhost-only binding for local servers. The previous implementation called `app.listen(port)` without a host, which could bind to all interfaces depending on Node/Express defaults, contradicting the banner that claimed `127.0.0.1`.

### 25. Canonical shutdown through `server.close()`

**Guide said:** Not addressed. Initial external guidance incorrectly stated `McpServer.close()` does not exist.

**Implementation:** All shutdown paths now use `server.close()`, which closes the active transport internally. Direct `transport.close()` is not the initiated shutdown path. Stateless mode tracks active per-request servers so `stop()` can terminate in-flight work. Stateful mode uses an idempotent `closing` guard to prevent recursive shutdown.

**Why:** The SDK's `McpServer.close()` method delegates to the transport's close internally. Using it as the canonical shutdown path is cleaner and prevents the server and transport lifecycles from getting out of sync.

### 26. Machine-readable `/mcp` error responses

**Guide said:** Not addressed.

**Implementation:** Async HTTP route handlers are wrapped with `asyncExpressHandler(...)` to forward rejections into Express's error pipeline. A terminal `/mcp` error responder is registered after all transport routes and returns deliberate machine-readable responses: JSON-RPC internal errors for POST, structured JSON for other methods.

**Why:** Without this, failures in setup, connection, or request handling would produce Express's default HTML 500 response, which is not useful for MCP clients.

### 27. Sync-only setup with known type loophole

**Guide said:** Not addressed.

**Implementation:** `createMcpServer()` uses a generic type constraint to reject promise-returning setup callbacks at the callsite. A known loophole exists: callbacks pre-typed as `ConfigureMcpServer` can bypass the check because TypeScript widens the return type to `void`. This is documented in code with a TODO.

**Why:** Setup is intentionally synchronous because `createConfiguredServer()` does not await the callback before connecting the server to its transport. Allowing async setup without awaiting it would create a race between configuration and connection.

### 28. Setup callback receives McpServerContext for auth

**Guide said:** Not addressed.

**Implementation:** The setup callback signature is `setup(server, context)`. The second argument `context` is an `McpServerContext` that carries `isAuthEnabled` (from transport config) and `retrieveAuthData(extra)`. Handlers receive `(args, extra)`; passing `extra` to `context.retrieveAuthData(extra)` yields `{ isAuthEnabled: false }` or `{ isAuthEnabled: true, sub, clientId, scopes }`. Use `sub` (never `clientId`) as the storage key for user-scoped data; when auth is disabled, use a constant like `"local"`.

**Why:** User-scoped tools (e.g. task storage, document stores) need a stable per-user key. Auth0 `sub` identifies the user across clients; `clientId` varies per MCP client and would fragment data. The `example-ecosystem/mcps/live-monitor/` server demonstrates this pattern.

---

## Summary

| # | Guide section | Change | Category |
| --- | --- | --- | --- |
| 1 | 6 (layout) | Tool/ecosystem split | Structural |
| 2 | 6 (layout) | Servers in `mcps/` | Structural |
| 3 | 16.5 (artifacts) | Runtime config derived at startup (no generated file) | Structural |
| 4 | 14 (runtime) | Server bootstrap as npm subpath export | Structural |
| 5 | 18 (metadata) | `managed_by` uses package name | Auth0 |
| 6 | 12.2 (access policy) | Direct Management API reconciliation | Auth0 |
| 7 | 9.3, 15.2 (scope check) | Reactive instead of proactive | Auth0 |
| 8 | 16.1 (auth) | Auto-refresh, self-contained verify-tenant | Auth0 |
| 9 | 7.2 (callback) | Corrected to Cursor's actual URI | Data model |
| 10 | 7.4 (slug) | Single-char slugs allowed | Data model |
| 11 | 16.5 (overwrite) | No `--apply` mode, `--dry-run` instead | Not implemented |
| 12 | 21.5 (add-scope) | No auto-patch of grants | Not implemented |
| 13 | 17.3 (drift) | No separate drift report | Not implemented |
| 14 | -- | `generate-artifacts` standalone command | Added |
| 15 | -- | Auth opt-out for local dev | Added |
| 16 | -- | Management token auto-refresh | Added |
| 17 | 16.2.6 | `client_id` write-back | Added |
| 18 | 16.4.5 | Stale grant cleanup | Added |
| 19 | 20 | Cursor Agent Skill | Added |
| 20 | 7.1, 9.3 | Slim config file, hardcoded defaults, env vars for auth0 | Structural |
| 21 | 14 (runtime) | Setup callback replaces builder proxy | Runtime |
| 22 | 14 (runtime) | Fresh McpServer per HTTP request/session | Runtime |
| 23 | 14 (runtime) | Origin validation on HTTP transports | Runtime |
| 24 | -- | Localhost-default host binding | Runtime |
| 25 | -- | Canonical shutdown through `server.close()` | Runtime |
| 26 | -- | Machine-readable `/mcp` error responses | Runtime |
| 27 | -- | Sync-only setup with known type loophole | Runtime |
| 28 | -- | Setup callback receives McpServerContext for auth | Runtime |
| 29 | -- | `use_trailing_slash` for API identifier and resource URI | Added |
