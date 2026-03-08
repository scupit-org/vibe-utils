import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpConfiguration } from "./mcp-configuration.js";
import type { RuntimeConfig } from "./create-server.js";

type CreateConfiguredServer = () => McpServer;

/**
 * Standard I/O MCP server. Communicates over stdin/stdout via JSON-RPC.
 * Intended for local CLI and desktop app integrations where the client
 * spawns the server as a child process.
 */
export class StdioMcp implements McpConfiguration {
  readonly config: RuntimeConfig;

  private readonly _createConfiguredServer: CreateConfiguredServer;
  private _server: McpServer | undefined;
  private _transport: StdioServerTransport | undefined;

  constructor(createConfiguredServer: CreateConfiguredServer, config: RuntimeConfig) {
    this._createConfiguredServer = createConfiguredServer;
    this.config = config;
  }

  async begin(): Promise<void> {
    this._server = this._createConfiguredServer();
    this._transport = new StdioServerTransport();
    console.error(`  ${this.config.server.name} (stdio)`);
    console.error(`  Waiting for client on stdin...\n`);
    await this._server.connect(this._transport);
  }

  async stop(): Promise<void> {
    if (this._server) {
      // Closing the SDK server here is sufficient; it closes the active
      // transport internally as part of shutdown.
      await this._server.close();
      this._server = undefined;
      this._transport = undefined;
    }
  }
}
