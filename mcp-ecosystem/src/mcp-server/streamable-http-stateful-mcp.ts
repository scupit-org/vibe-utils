import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpConfiguration } from "./mcp-configuration.js";
import type { RuntimeConfig } from "./create-server.js";
import type { StreamableHttpStatefulTransportConfig } from "./transport-config.js";
import { buildHttpApp, logHttpBanner } from "./http-app.js";

/**
 * Stateful Streamable HTTP MCP server. Maintains per-client sessions via
 * `mcp-session-id`, enabling features like sampling, progress notifications,
 * resource subscriptions, and server-initiated requests.
 */
export class StreamableHttpStatefulMcp implements McpConfiguration {
  readonly builder: McpServer;
  readonly config: RuntimeConfig;

  private readonly _port: number;
  private readonly _authEnabled: boolean;
  private readonly _transportConfig: StreamableHttpStatefulTransportConfig;
  private readonly _sessions = new Map<string, StreamableHTTPServerTransport>();
  private _httpServer: Server | undefined;

  constructor(
    mcpServer: McpServer,
    config: RuntimeConfig,
    transportConfig: StreamableHttpStatefulTransportConfig,
  ) {
    this.builder = mcpServer;
    this.config = config;
    this._port = transportConfig.port ?? parseInt(process.env["PORT"] ?? "3000", 10);
    this._authEnabled = transportConfig.auth?.enabled !== false;
    this._transportConfig = transportConfig;
  }

  async begin(): Promise<void> {
    const { app } = buildHttpApp(this.config, this._authEnabled);

    app.post("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && this._sessions.has(sessionId)) {
        const transport = this._sessions.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: this._transportConfig.enableJsonResponse ?? false,
          eventStore: this._transportConfig.eventStore,
          retryInterval: this._transportConfig.retryInterval,
          onsessioninitialized: (sid) => {
            this._sessions.set(sid, transport);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) this._sessions.delete(sid);
        };

        await this.builder.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
    });

    app.get("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !this._sessions.has(sessionId)) {
        res.status(400).json({ error: "Invalid or missing session ID" });
        return;
      }
      const transport = this._sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
    });

    app.delete("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !this._sessions.has(sessionId)) {
        res.status(400).json({ error: "Invalid or missing session ID" });
        return;
      }
      const transport = this._sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
    });

    return new Promise<void>((resolve) => {
      this._httpServer = app.listen(this._port, () => {
        logHttpBanner(this.config, this._port, this._authEnabled);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const [sid, transport] of this._sessions) {
      try {
        await transport.close();
      } catch { /* best-effort cleanup */ }
      this._sessions.delete(sid);
    }

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
