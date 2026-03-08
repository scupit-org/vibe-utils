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
