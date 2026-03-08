import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpConfiguration } from "./mcp-configuration.js";
import type { RuntimeConfig } from "./create-server.js";
import type { StreamableHttpStatefulTransportConfig } from "./transport-config.js";
import { denyAllOrigins } from "./origin-validation.js";
import {
  attachMcpErrorHandler,
  asyncExpressHandler,
  buildHttpApp,
  logHttpBanner,
} from "./http-app.js";

const DEFAULT_HOST = "127.0.0.1";
type CreateConfiguredServer = () => McpServer;

interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  closing: boolean;
}

/**
 * Stateful Streamable HTTP MCP server. Maintains per-client sessions via
 * `mcp-session-id`, enabling features like sampling, progress notifications,
 * resource subscriptions, and server-initiated requests.
 *
 * Each session gets its own isolated `McpServer` + transport pair per the MCP
 * spec guidance (GHSA-345p-7cg4-v4c7).
 */
export class StreamableHttpStatefulMcp implements McpConfiguration {
  readonly config: RuntimeConfig;

  private readonly _createConfiguredServer: CreateConfiguredServer;
  private readonly _port: number;
  private readonly _host: string;
  private readonly _authEnabled: boolean;
  private readonly _transportConfig: StreamableHttpStatefulTransportConfig;
  private readonly _sessions = new Map<string, SessionEntry>();
  private _httpServer: Server | undefined;

  constructor(
    createConfiguredServer: CreateConfiguredServer,
    config: RuntimeConfig,
    transportConfig: StreamableHttpStatefulTransportConfig,
  ) {
    this._createConfiguredServer = createConfiguredServer;
    this.config = config;
    this._port = transportConfig.port ?? parseInt(process.env["PORT"] ?? "3000", 10);
    this._host = transportConfig.host ?? DEFAULT_HOST;
    this._authEnabled = transportConfig.auth?.enabled !== false;
    this._transportConfig = transportConfig;
  }

  async begin(): Promise<void> {
    const originValidator = this._transportConfig.origin ?? denyAllOrigins();
    const { app } = buildHttpApp(this.config, this._authEnabled, originValidator);

    app.post("/mcp", asyncExpressHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId) {
        const entry = this._sessions.get(sessionId);
        if (!entry) {
          res.status(404).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Session not found" },
            id: null,
          });
          return;
        }
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      if (isInitializeRequest(req.body)) {
        const server = this._createConfiguredServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: this._transportConfig.enableJsonResponse ?? false,
          eventStore: this._transportConfig.eventStore,
          retryInterval: this._transportConfig.retryInterval,
          onsessioninitialized: (sid) => {
            this._sessions.set(sid, { server, transport, closing: false });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          const entry = sid ? this._sessions.get(sid) : undefined;
          if (sid) this._sessions.delete(sid);
          if (entry && !entry.closing) {
            entry.closing = true;
            // Closing the SDK server here is sufficient; it closes the active
            // transport internally as part of shutdown.
            server.close().catch(() => {});
          }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing session ID or not an initialize request",
        },
        id: null,
      });
    }));

    app.get("/mcp", asyncExpressHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: "Missing session ID" });
        return;
      }
      const entry = this._sessions.get(sessionId);
      if (!entry) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await entry.transport.handleRequest(req, res);
    }));

    app.delete("/mcp", asyncExpressHandler(async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: "Missing session ID" });
        return;
      }
      const entry = this._sessions.get(sessionId);
      if (!entry) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await entry.transport.handleRequest(req, res);
    }));

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
      [...this._sessions.values()].map((entry) => {
        entry.closing = true;
        // Closing the SDK server here is sufficient; it closes the active
        // transport internally as part of shutdown.
        return entry.server.close();
      }),
    ).then(() => {
      this._sessions.clear();
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
