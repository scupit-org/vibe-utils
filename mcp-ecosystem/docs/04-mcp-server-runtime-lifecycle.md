# MCP Server Runtime Lifecycle

This document describes the runtime behavior of MCP servers created with `createMcpServer()`. It covers the server factory model, transport-specific lifecycles, shutdown semantics, error handling, and security defaults.

For the environment/bootstrap boundary and `.env` handling, see [Managed Env And Reconciliation Lifecycle](./03-managed-env-and-reconciliation-lifecycle.md).

---

## The `createMcpServer()` API

```ts
import {
  createMcpServer,
  streamableHttpStatelessTransport,
} from "@scupit/mcp-ecosystem/server";

const mcp = await createMcpServer(
  import.meta.url,
  { transport: streamableHttpStatelessTransport({ port: 3001 }) },
  (server) => {
    server.registerTool("my-tool", { ... }, async (args) => { ... });
  },
);

await mcp.begin();
```

The three arguments are:

1. `importMetaUrl` — used to locate the server's `mcp-configuration.json` and ecosystem root.
2. `options?` — transport config (or result of `resolveTransportSelection()`), version override.
3. `setup?` — a synchronous callback that receives the real SDK `McpServer` instance.

### Transport selection

**Single transport:** Use the helper functions for ergonomics:

- `stdioTransport({})` — stdio transport
- `streamableHttpStatelessTransport(config)` — stateless HTTP
- `streamableHttpStatefulTransport(config)` — stateful HTTP

**Multiple transports:** Use `resolveTransportSelection()` when you want to support stdio and HTTP and select at runtime. Resolution order: (1) `selectedTransport` override, (2) `--transport=<name>` CLI flag, (3) `MCP_TRANSPORT` env var. No default or auto-selection; explicit selection is required. Accepted values: `stdio`, `streamable_http_stateless`, `streamable_http_stateful`, or hyphenated variants (`streamable-http-stateless`, `streamable-http-stateful`).

The returned handle exposes:

- `config` — the resolved `RuntimeConfig` (hostname, resource URI, auth issuer/audience, scopes).
- `begin()` — starts the server.
- `stop()` — gracefully shuts down all active connections.

---

## The Setup Callback

The `setup(server)` callback is where you register tools, resources, and prompts on the SDK `McpServer`. It receives the real SDK instance, not a custom abstraction.

### When setup is called

| Transport | When `setup(server)` runs |
|---|---|
| Stateless HTTP | Once per incoming POST request |
| Stateful HTTP | Once per new session (on initialize) |
| Stdio | Once per process (in `begin()`) |

Because setup runs on every fresh server instance, it should contain only registration logic. Do not perform expensive one-time initialization inside the callback; do that before calling `createMcpServer()`.

### Setup must be synchronous

Setup is intentionally synchronous today. The server factory calls `setup(server)` and immediately connects the server to its transport. It does not await a returned promise.

Promise-returning setup callbacks are rejected at the type level for inline callbacks. There is a known deferred loophole: if a callback is pre-typed as `ConfigureMcpServer`, TypeScript widens the return type to `void` and an async implementation can slip through. That loophole is documented in code with a TODO and should be tightened later.

If you need async initialization (e.g. loading data from a database), perform it before calling `createMcpServer()` and close over the results in the setup callback.

---

## Why There Is No `.builder`

An earlier iteration of this system exposed a `builder` property on the returned handle so callers could register tools after `createMcpServer()` returned. That approach required a custom recording proxy that captured registration calls and replayed them onto each fresh `McpServer` instance.

That abstraction was removed because:

- It required mirroring the SDK's registration method signatures in a custom interface.
- Replay logic introduced correctness risks around method invocation semantics.
- Type complexity grew disproportionately to the value it provided.
- The setup-callback model is simpler and preserves all needed functionality.

The current `setup(server)` callback gives callers direct access to the real SDK `McpServer` without any intermediary.

---

## Transport Lifecycles

### Stateless HTTP

Each `POST /mcp` request creates:

1. A fresh `McpServer` via the server factory (which calls `setup(server)`).
2. A fresh `StreamableHTTPServerTransport` with no session tracking.

The server is connected to the transport, the request is handled, and both are cleaned up when the response completes.

`GET /mcp` and `DELETE /mcp` return `405 Method Not Allowed`.

Active per-request servers are tracked in a `Set<McpServer>` so `stop()` can terminate in-flight work. Cleanup is registered on both `res.finish` (normal completion) and `res.close` (client disconnect) using an idempotent guard to ensure it runs exactly once.

### Stateful HTTP

Session initialization (`POST /mcp` with an `initialize` JSON-RPC request and no `mcp-session-id` header) creates:

1. A fresh `McpServer` via the server factory.
2. A fresh `StreamableHTTPServerTransport` with a UUID session ID generator.

Both are stored together in a session map. Subsequent requests with a valid `mcp-session-id` header reuse the stored server+transport pair for that session.

Error codes follow the MCP spec:

- Missing `mcp-session-id` header on a non-initialize request: `400 Bad Request`.
- Unknown or expired `mcp-session-id`: `404 Not Found`.

When a transport closes, its `onclose` handler removes the session entry and closes the server. Shutdown is guarded with a `closing` flag so that `stop()`-initiated server closes do not recursively trigger `onclose` cleanup.

### Stdio

A single `McpServer` is created in `begin()` via the server factory. A `StdioServerTransport` is connected to it. There is no HTTP layer, no auth, and no session management.

---

## Shutdown Semantics

Shutdown is always initiated through `server.close()`, which closes the active transport internally. Direct `transport.close()` is not the normal shutdown path.

### Stateless HTTP `stop()`

1. Closes all tracked active per-request servers via `Promise.allSettled(...)`.
2. Closes the listening HTTP server.
3. Both happen concurrently.

### Stateful HTTP `stop()`

1. Closes all session servers via `Promise.allSettled(...)`, with each entry's `closing` flag set first to prevent recursive cleanup.
2. Closes the listening HTTP server.
3. Both happen concurrently.

### Stdio `stop()`

Closes the server instance, which closes the stdio transport internally.

---

## Error Handling

### Async route handler safety

All async HTTP MCP route handlers are wrapped with `asyncExpressHandler(...)`, which forwards rejections into Express's error pipeline via `next(err)`. This prevents unhandled promise rejections from:

- `setup(server)` throwing during server creation
- `server.connect(transport)` failing
- `transport.handleRequest(...)` rejecting

### Machine-readable `/mcp` error responses

A terminal error responder is registered on `/mcp` **after** all transport route handlers. This ordering is critical because Express error middleware only catches errors from middleware and routes registered before it.

The error responder returns deliberate machine-readable responses:

- `POST /mcp` failures: JSON-RPC-shaped internal error (`-32603`).
- Non-POST `/mcp` failures: structured JSON error with `error` and `message` fields.

If headers have already been sent when the error occurs, it delegates to Express's default behavior.

---

## Origin Validation

Origin validation is required by the MCP spec for HTTP transports to prevent DNS rebinding attacks.

### Default behavior

If no `origin` validator is configured, the default policy is `denyAllOrigins()`: any request carrying a browser `Origin` header is rejected with `403 Forbidden`. Requests without an `Origin` header (non-browser MCP clients like Claude Desktop, Cursor, etc.) are always allowed through.

### Pre-built helpers

| Helper | Behavior |
|---|---|
| `denyAllOrigins()` | Reject all browser origins (the default) |
| `allowLocalOrigins()` | Allow `http(s)://localhost` and `http(s)://127.0.0.1` origins |
| `allowOrigins([...])` | Allow an explicit allowlist of exact origin strings |

Configure via the `origin` field in the HTTP transport config:

```ts
import {
  createMcpServer,
  allowLocalOrigins,
  streamableHttpStatelessTransport,
} from "@scupit/mcp-ecosystem/server";

const mcp = await createMcpServer(import.meta.url, {
  transport: streamableHttpStatelessTransport({
    port: 3001,
    origin: allowLocalOrigins(),
  }),
}, setup);
```

Origin validation runs before auth middleware.

---

## Host Binding

HTTP transports default to binding on `127.0.0.1` (loopback only), per MCP spec guidance for locally hosted servers.

To bind to all interfaces (for example, behind a reverse proxy), set `host: "0.0.0.0"` in the transport config. The startup banner always prints the actual bound address.

---

## Known Deferred Issues

### Sync-only setup type guard loophole

The type-level guard on `createMcpServer()` rejects inline async setup callbacks, but a callback pre-typed as `ConfigureMcpServer` can bypass the check because TypeScript widens its return type to `void`. This is documented in code with a TODO. If stricter enforcement is needed, the type guard should be tightened.
