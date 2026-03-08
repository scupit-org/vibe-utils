# Agent Guidelines

Instructions for AI agents working on this codebase.

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

server.registerTool("my-tool", { description: "..." }, mcpToolHandler(async (args) => {
  return { content: [{ type: "text", text: "result" }] };
}));
server.registerResource("my-resource", "file:///path", { description: "..." }, mcpResourceHandler(async (uri) => {
  return { contents: [{ uri: uri.href, text: "..." }] };
}));
server.registerPrompt("my-prompt", { description: "..." }, mcpPromptHandler(async () => {
  return { messages: [{ role: "user", content: { type: "text", text: "..." } }] };
}));
```

Do **not** write manual `try/catch` blocks — use the appropriate wrapper instead.

## Example Ecosystem Validation

The `example-ecosystem/` references the toplevel package via `"@scupit/mcp-ecosystem": "file:.."`. To properly test and ensure the example project has no type errors after changes to the library:

1. **Build** the toplevel project: `npm run build` (in `mcp-ecosystem/`)
2. **Pack** the package: `npm pack` (in `mcp-ecosystem/`)
3. **Install** in the example: `npm install` (in `example-ecosystem/`)
4. **Typecheck** the example: `npx tsc --noEmit` (in `example-ecosystem/`)

## Managing Example Servers with PM2

Use PM2 to run and manage the example MCP servers during testing. Install the latest PM2 with `npm install pm2 --save-dev` (in `example-ecosystem/`). Transport must be explicitly chosen; there is no default.

| Command | Action |
|---------|--------|
| `npm run pm2:start:http_stateless` | Start all servers with streamable_http_stateless |
| `npm run pm2:start:stdio` | Start all servers with stdio |
| `npm run pm2:status` | List running processes |
| `npm run pm2:logs` | Stream logs from all servers |
| `npm run pm2:stop` | Stop all servers |
| `npm run pm2:delete` | Remove from PM2 (run after stop to fully clean up) |
| `pm2 start ecosystem.config.cjs --env stdio` | Platform-agnostic: all servers use stdio |
| `pm2 start ecosystem.config.cjs --env http_stateless` | Platform-agnostic: all servers use HTTP stateless |

The ecosystem config is `example-ecosystem/ecosystem.config.cjs`. To act on a single server: `pm2 stop mcp-git`, `pm2 restart mcp-files`, etc.
