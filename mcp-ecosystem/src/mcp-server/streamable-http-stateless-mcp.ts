import type { Server } from "node:http";
import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpConfiguration } from "./mcp-configuration.js";
import type { RuntimeConfig } from "./create-server.js";
import type { StreamableHttpStatelessTransportConfig } from "./transport-config.js";
import { denyAllOrigins } from "./origin-validation.js";
import {
  attachMcpErrorHandler,
  asyncExpressHandler,
  buildHttpApp,
  logHttpBanner,
} from "./http-app.js";

const DEFAULT_HOST = "127.0.0.1";
type CreateConfiguredServer = () => McpServer;

/**
 * Stateless Streamable HTTP MCP server. Creates a fresh `McpServer` and
 * transport for every incoming POST request with no session tracking.
 *
 * This follows the MCP spec guidance: each request gets an isolated
 * server+transport pair so concurrent requests cannot interfere with each
 * other.
 */
export class StreamableHttpStatelessMcp implements McpConfiguration {
  readonly config: RuntimeConfig;

  private readonly _createConfiguredServer: CreateConfiguredServer;
  private readonly _port: number;
  private readonly _host: string;
  private readonly _authEnabled: boolean;
  private readonly _enableJsonResponse: boolean;
  private readonly _transportConfig: StreamableHttpStatelessTransportConfig;
  private readonly _activeServers = new Set<McpServer>();
  private _httpServer: Server | undefined;

  constructor(
    createConfiguredServer: CreateConfiguredServer,
    config: RuntimeConfig,
    transportConfig: StreamableHttpStatelessTransportConfig,
  ) {
    this._createConfiguredServer = createConfiguredServer;
    this.config = config;
    this._port = transportConfig.port;
    this._host = transportConfig.host ?? DEFAULT_HOST;
    this._authEnabled = transportConfig.auth?.enabled !== false;
    this._enableJsonResponse = transportConfig.enableJsonResponse ?? false;
    this._transportConfig = transportConfig;
  }

  async begin(): Promise<void> {
    const originValidator = this._transportConfig.origin ?? denyAllOrigins();
    const { app } = buildHttpApp(this.config, this._authEnabled, originValidator);

    app.post("/mcp", asyncExpressHandler(async (req: Request, res: Response) => {
      const server = this._createConfiguredServer();
      this._activeServers.add(server);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: this._enableJsonResponse,
      });
      let cleanedUp = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        this._activeServers.delete(server);
        // Closing the SDK server here is sufficient; it closes the active
        // transport internally as part of shutdown.
        server.close().catch(() => {});
      };

      res.on("finish", cleanup);
      res.on("close", cleanup);

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    }));

    app.get("/mcp", (_req: Request, res: Response) => {
      res.status(405).json({ error: "Method not allowed. Use POST for MCP requests." });
    });

    app.delete("/mcp", (_req: Request, res: Response) => {
      res.status(405).json({ error: "Method not allowed." });
    });

    attachMcpErrorHandler(app);

    return new Promise<void>((resolve) => {
      this._httpServer = app.listen(this._port, this._host, () => {
        logHttpBanner(this.config, this._host, this._port, this._authEnabled);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const closeActiveServers = Promise.allSettled(
      [...this._activeServers].map((server) => {
        // Closing the SDK server here is sufficient; it closes the active
        // transport internally as part of shutdown.
        return server.close();
      }),
    ).then(() => {
      this._activeServers.clear();
    });

    const closeHttpServer = new Promise<void>((resolve, reject) => {
      if (!this._httpServer) {
        resolve();
        return;
      }
      this._httpServer.close((err) => (err ? reject(err) : resolve()));
      this._httpServer = undefined;
    });

    await Promise.all([closeHttpServer, closeActiveServers]);
  }
}
