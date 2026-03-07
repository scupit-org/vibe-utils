import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpConfiguration } from "./mcp-configuration.js";
import type { RuntimeConfig } from "./create-server.js";

/**
 * Standard I/O MCP server. Communicates over stdin/stdout via JSON-RPC.
 * Intended for local CLI and desktop app integrations where the client
 * spawns the server as a child process.
 */
export class StdioMcp implements McpConfiguration {
  readonly builder: McpServer;
  readonly config: RuntimeConfig;

  private _transport: StdioServerTransport | undefined;

  constructor(mcpServer: McpServer, config: RuntimeConfig) {
    this.builder = mcpServer;
    this.config = config;
  }

  async begin(): Promise<void> {
    this._transport = new StdioServerTransport();
    console.error(`  ${this.config.server.name} (stdio)`);
    console.error(`  Waiting for client on stdin...\n`);
    await this.builder.connect(this._transport);
  }

  async stop(): Promise<void> {
    if (this._transport) {
      await this._transport.close();
      this._transport = undefined;
    }
  }
}
