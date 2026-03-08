import type {
  CallToolResult,
  GetPromptResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpToolCallback = (...args: any[]) => CallToolResult | Promise<CallToolResult>;

/**
 * Wraps an MCP tool handler in a standard try/catch that converts any thrown
 * error into an `isError: true` {@link CallToolResult} response, so individual
 * tool handlers don't need to repeat the same boilerplate.
 *
 * The generic `T` is preserved so TypeScript can propagate contextual parameter
 * types from `registerTool`'s `inputSchema` into the wrapped callback.
 *
 * Usage:
 * ```ts
 * server.registerTool("my_tool", { ... }, mcpToolHandler(async ({ arg }) => {
 *   const result = await doSomething(arg);
 *   return { content: [{ type: "text", text: result }] };
 * }));
 * ```
 */
export function mcpToolHandler<T extends McpToolCallback>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  }) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpResourceCallback = (uri: URL, ...rest: any[]) => ReadResourceResult | Promise<ReadResourceResult>;

/**
 * Wraps an MCP resource read handler in a standard try/catch. Use with
 * `registerResource` (static URI or template). Errors are returned as
 * {@link ReadResourceResult} with a single text content block.
 */
export function mcpResourceHandler<T extends McpResourceCallback>(fn: T): T {
  return (async (uri: URL, ...rest: unknown[]) => {
    try {
      return await fn(uri, ...rest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        contents: [{ uri: uri.href, text: `Error: ${message}`, mimeType: "text/plain" }],
      };
    }
  }) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpPromptCallback = (...args: any[]) => GetPromptResult | Promise<GetPromptResult>;

/**
 * Wraps an MCP prompt handler in a standard try/catch. Use with
 * `registerPrompt`. Errors are returned as {@link GetPromptResult} with
 * a single user message containing the error text.
 */
export function mcpPromptHandler<T extends McpPromptCallback>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        messages: [{ role: "user", content: { type: "text", text: `Error: ${message}` } }],
      };
    }
  }) as T;
}
