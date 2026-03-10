# Agent Guidelines

Instructions for AI agents working on this codebase.

## Version

If the version string in `package.json` is changed, update the CLI version in `src/cli.ts` (`.version(...)`) to match.

## Imports

**All imports must be done at the top of the file.** Do not use inline or dynamic imports (e.g. `await import(...)` or `require()` inside functions, conditionals, or switch branches). Use static top-level `import` statements only.

## MCP Handlers

Always wrap MCP handler callbacks with the appropriate wrapper from `@scupit/mcp-ecosystem/server`. Each provides standard error handling so individual handlers do not need their own `try/catch` blocks.

| Method | Wrapper | Use for |
|--------|---------|---------|
| `registerTool` | `mcpToolHandler()` | Tool callbacks → `CallToolResult` |
| `registerResource` | `mcpResourceHandler()` | Resource read callbacks → `ReadResourceResult` |
| `registerPrompt` | `mcpPromptHandler()` | Prompt callbacks → `GetPromptResult` |

```typescript
import { createMcpServer, mcpToolHandler, mcpResourceHandler, mcpPromptHandler } from "@scupit/mcp-ecosystem/server";

function configureMcp(server, context) {
  server.registerTool("my-tool", { description: "..." }, mcpToolHandler(async (args) => {
    return { content: [{ type: "text", text: "result" }] };
  }));
  server.registerResource("my-resource", "file:///path", { description: "..." }, mcpResourceHandler(async (uri) => {
    return { contents: [{ uri: uri.href, text: "..." }] };
  }));
  server.registerPrompt("my-prompt", { description: "..." }, mcpPromptHandler(async () => {
    return { messages: [{ role: "user", content: { type: "text", text: "..." } }] };
  }));
}

const mcp = await createMcpServer(import.meta.url, { transport: ... }, configureMcp);
```

The setup callback receives `(server, context)` where `context` is `McpServerContext`. For user-scoped tools that need identity, use `(args, extra)` and `context.retrieveAuthData(extra)`:

```typescript
server.registerTool("my-tool", { ... }, mcpToolHandler(async (args, extra) => {
  const auth = context.retrieveAuthData(extra);
  const userId = auth.isAuthEnabled ? auth.sub : "local";
  // use userId as storage key
  return { content: [{ type: "text", text: "result" }] };
}));
```

For tools that modify state, check `auth.scopes` before proceeding. The framework extracts scopes from the token but does not enforce them; the server implementer is responsible for scope checks:

```typescript
server.registerTool("write-tool", { ... }, mcpToolHandler(async (args, extra) => {
  const auth = context.retrieveAuthData(extra);
  if (auth.isAuthEnabled && !auth.scopes.includes("tools.write")) {
    throw new Error("Insufficient scope: tools.write required");
  }
  // ... perform write operation
  return { content: [{ type: "text", text: "done" }] };
}));
```

Built-in scopes: `tools.read`, `tools.write`, `resources.read`, `prompts.read` (see [README Auth model](README.md#auth-model) or [Ecosystem Defaults](docs/02-ecosystem-defaults.md#scope-profiles) for the full reference). See `example-ecosystem/mcps/live-monitor/server.ts` for `start_task` (tools.write) and `list_tasks` (tools.read) scope-check examples.

Do **not** write manual `try/catch` blocks — use the appropriate wrapper instead.

## Example Ecosystem Validation

The `example-ecosystem/` references the toplevel package via `"@scupit/mcp-ecosystem": "file:.."`. To properly test and ensure the example project has no type errors after changes to the library:

1. **Build** the toplevel project: `npm run build` (in `mcp-ecosystem/`)
2. **Pack** the package: `npm pack` (in `mcp-ecosystem/`)
3. **Install** in the example: `npm install` (in `example-ecosystem/`)
4. **Typecheck** the example: `npx tsc --noEmit` (in `example-ecosystem/`)

## Managing Example Servers with PM2

Use PM2 to run and manage the example MCP servers during testing. Install the latest PM2 with `npm install pm2 --save-dev` (in `example-ecosystem/`). Transport must be explicitly chosen; there is no default.

The npm scripts use `--only` to start only the servers that support each transport. This avoids launching incompatible servers (which would crash and waste time).

| Command | Action |
|---------|--------|
| `npm run pm2:start:http_stateless` | Start mcp-git, mcp-files, mcp-all-in-one (streamable_http_stateless) |
| `npm run pm2:start:http_stateful` | Start mcp-live-monitor only (streamable_http_stateful) |
| `npm run pm2:start:stdio` | Start all 4 servers (stdio) |
| `npm run pm2:status` | List running processes |
| `npm run pm2:logs` | Stream logs from all servers |
| `npm run pm2:stop` | Stop all servers |
| `npm run pm2:delete` | Remove from PM2 (run after stop to fully clean up) |

**When adding a new MCP server** to `example-ecosystem/mcps/`, update the `--only` lists in `package.json` for each script that matches the server's supported transports:

- `pm2:start:stdio` — add to the list if the server supports stdio
- `pm2:start:http_stateless` — add if it supports streamable_http_stateless
- `pm2:start:http_stateful` — add if it supports streamable_http_stateful

See the comment block at the top of `ecosystem.config.cjs` for the current mapping.

The ecosystem config is `example-ecosystem/ecosystem.config.cjs`. To act on a single server: `pm2 stop mcp-git`, `pm2 restart mcp-files`, etc.

## Docker Deployment

To build and redeploy the Live Monitor container after toolkit changes, run from `mcp-ecosystem/`:

```bash
docker compose up -d --build
```

The Dockerfile uses `npm install` (not `npm ci`) for the example-ecosystem step because the `file:..` dependency for `@scupit/mcp-ecosystem` does not resolve correctly with `npm ci` in the Docker build context.
