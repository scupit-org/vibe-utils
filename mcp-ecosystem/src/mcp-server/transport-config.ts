import type { EventStore } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Options shared by all Streamable HTTP transport variants.
 */
interface StreamableHttpBaseTransportConfig {
  /**
   * TCP port to listen on.
   *
   * @default parseInt(process.env.PORT ?? "3000", 10)
   */
  port?: number;

  /**
   * Auth configuration. When enabled (the default), bearer token validation
   * is enforced on the `/mcp` endpoint using Auth0 JWKS verification.
   * Set `{ enabled: false }` only for local development without a real Auth0 tenant.
   */
  auth?: { enabled: boolean };

  /**
   * When `true`, POST responses are plain `application/json` instead of
   * `text/event-stream`. Useful for clients that don't properly handle SSE,
   * or when streaming is unnecessary. GET requests are rejected with 405.
   *
   * @default false
   */
  enableJsonResponse?: boolean;
}

/**
 * Stateless Streamable HTTP transport. Each request is handled independently
 * with no session tracking. Ideal for simple tool-call servers that scale
 * horizontally without sticky sessions.
 */
export interface StreamableHttpStatelessTransportConfig
  extends StreamableHttpBaseTransportConfig {
  type: "streamable-http-stateless";
}

/**
 * Stateful Streamable HTTP transport. Maintains per-client sessions via the
 * `mcp-session-id` header. Enables advanced features like sampling, progress
 * notifications, resource subscriptions, and server-initiated requests.
 *
 * Requires sticky sessions or shared state when scaling horizontally.
 */
export interface StreamableHttpStatefulTransportConfig
  extends StreamableHttpBaseTransportConfig {
  type: "streamable-http-stateful";

  /**
   * Event store for resumability. When provided, the server persists SSE
   * events and replays missed ones when a client reconnects with
   * `Last-Event-ID`. Use `InMemoryEventStore` for development or provide
   * a custom `EventStore` implementation with durable storage for production.
   *
   * Ignored when `enableJsonResponse` is `true`.
   */
  eventStore?: EventStore;

  /**
   * Retry interval (ms) suggested to clients via the SSE `retry` field.
   * Controls how quickly clients reconnect after a dropped connection.
   *
   * Ignored when `enableJsonResponse` is `true`.
   */
  retryInterval?: number;
}

/**
 * Standard I/O transport. Communicates over stdin/stdout using JSON-RPC.
 * Ideal for local CLI integrations and desktop app integrations (e.g.
 * Claude Desktop) where the client spawns the server as a child process.
 *
 * No HTTP server, no auth, single-client only.
 */
export interface StdioTransportConfig {
  type: "stdio";
}

/**
 * Tagged union describing how the MCP server communicates with clients.
 *
 * @default `{ type: "streamable-http-stateless" }`
 */
export type TransportConfig =
  | StreamableHttpStatelessTransportConfig
  | StreamableHttpStatefulTransportConfig
  | StdioTransportConfig;
