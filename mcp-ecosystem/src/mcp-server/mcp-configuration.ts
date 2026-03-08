import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RuntimeConfig } from "./create-server.js";
import type { TransportConfig } from "./transport-config.js";

/**
 * Configure a fresh SDK {@link McpServer} instance before it is connected to a
 * transport.
 *
 * HTTP transports call this once per new request/session server instance.
 * Stdio calls it once for the process-wide server instance.
 */
export type ConfigureMcpServer = (server: McpServer) => void;

/**
 * Unified handle returned by {@link createMcpServer}. Provides access to the
 * resolved runtime configuration and lifecycle methods to start and stop the
 * server.
 */
export interface McpConfiguration {
  /** Resolved runtime configuration derived from the ecosystem files. */
  readonly config: RuntimeConfig;

  /**
   * Start the server. For HTTP transports this begins listening on the
   * configured port. For stdio this connects the transport to stdin/stdout.
   * Resolves once the server is ready to accept connections.
   */
  begin(): Promise<void>;

  /**
   * Gracefully shut down the server. Closes all active connections/sessions.
   */
  stop(): Promise<void>;
}

export interface CreateMcpServerOptions {
  /** Override the MCP server version string. @default "0.1.0" */
  version?: string;

  /**
   * Transport configuration. Determines how clients connect to this server.
   *
   * @default `{ type: "streamable-http-stateless" }`
   */
  transport?: TransportConfig;
}
