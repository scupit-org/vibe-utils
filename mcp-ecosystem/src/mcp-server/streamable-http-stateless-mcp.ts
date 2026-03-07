import type { Server } from "node:http";
import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpConfiguration } from "./mcp-configuration.js";
import type { RuntimeConfig } from "./create-server.js";
import type { StreamableHttpStatelessTransportConfig } from "./transport-config.js";
import { buildHttpApp, logHttpBanner } from "./http-app.js";

/**
 * Stateless Streamable HTTP MCP server. Creates a fresh transport for every
 * incoming POST request with no session tracking.
 */
export class StreamableHttpStatelessMcp implements McpConfiguration {
  readonly builder: McpServer;
  readonly config: RuntimeConfig;

  private readonly _port: number;
  private readonly _authEnabled: boolean;
  private readonly _enableJsonResponse: boolean;
  private _httpServer: Server | undefined;

  constructor(
    mcpServer: McpServer,
    config: RuntimeConfig,
    transportConfig: StreamableHttpStatelessTransportConfig,
  ) {
    this.builder = mcpServer;
    this.config = config;
    this._port = transportConfig.port ?? parseInt(process.env["PORT"] ?? "3000", 10);
    this._authEnabled = transportConfig.auth?.enabled !== false;
    this._enableJsonResponse = transportConfig.enableJsonResponse ?? false;
  }

  async begin(): Promise<void> {
    const { app } = buildHttpApp(this.config, this._authEnabled);

    app.post("/mcp", async (req: Request, res: Response) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: this._enableJsonResponse,
      });
      res.on("close", () => {
        transport.close().catch(() => {});
      });
      await this.builder.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get("/mcp", (_req: Request, res: Response) => {
      res.status(405).json({ error: "Method not allowed. Use POST for MCP requests." });
    });

    app.delete("/mcp", (_req: Request, res: Response) => {
      res.status(405).json({ error: "Method not allowed." });
    });

    return new Promise<void>((resolve) => {
      this._httpServer = app.listen(this._port, () => {
        logHttpBanner(this.config, this._port, this._authEnabled);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this._httpServer) {
        resolve();
        return;
      }
      this._httpServer.close((err) => (err ? reject(err) : resolve()));
      this._httpServer = undefined;
    });
  }
}
