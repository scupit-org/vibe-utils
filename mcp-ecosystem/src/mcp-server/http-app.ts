import express, {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import {
  createAuthMiddleware,
  type AuthMiddlewareOptions,
} from "../mcp-runtime/auth-middleware.js";
import { send401Challenge } from "../mcp-runtime/www-authenticate.js";
import type { OriginValidator } from "./origin-validation.js";
import type { RuntimeConfig } from "./create-server.js";

export interface HttpAppContext {
  app: express.Express;
  authEnabled: boolean;
}

function sendMcpInternalError(
  req: Request,
  res: Response,
  message: string,
): void {
  if (req.method === "POST") {
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message,
      },
      id: null,
    });
    return;
  }

  res.status(500).json({
    error: "internal_error",
    message,
  });
}

/**
 * Attach the terminal `/mcp` error responder. This must be registered after
 * the transport route handlers so Express can route rejected async handler
 * work into this middleware.
 */
export function attachMcpErrorHandler(app: express.Express): void {
  app.use("/mcp", (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    sendMcpInternalError(
      req,
      res,
      err instanceof Error ? err.message : "Internal server error",
    );
  });
}

type AsyncExpressRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Wrap an async Express route handler so any rejection is forwarded to the
 * Express error pipeline via `next(err)`.
 */
export function asyncExpressHandler(fn: AsyncExpressRouteHandler): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

/**
 * Build an Express app with the shared infrastructure that all HTTP-based
 * MCP transports need:
 *
 * - JSON body parsing
 * - Protected Resource Metadata at `/.well-known/oauth-protected-resource`
 * - Health check at `/health`
 * - Origin validation on `/mcp` (DNS rebinding protection)
 * - Auth middleware on `/mcp` (when enabled)
 *
 * The caller is responsible for attaching the transport-specific POST/GET/DELETE
 * handlers for `/mcp` to the returned `app`.
 */
export function buildHttpApp(
  config: RuntimeConfig,
  authEnabled: boolean,
  originValidator: OriginValidator,
): HttpAppContext {
  const app = express();
  app.use(express.json());

  app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      resource: config.server.resource_uri,
      authorization_servers: [config.auth.issuer],
      scopes_supported: config.scopes,
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: config.server.name });
  });

  app.use("/mcp", (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !originValidator(origin)) {
      res.status(403).json({ error: "Forbidden: origin not allowed" });
      return;
    }
    next();
  });

  if (authEnabled) {
    const authOptions: AuthMiddlewareOptions = {
      resourceUri: config.server.resource_uri,
      resourceMetadataUrl: config.auth.protected_resource_metadata_url,
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      jwksUri: config.auth.jwks_uri,
    };
    const authMiddleware = createAuthMiddleware(authOptions);

    app.use("/mcp", (req: Request, res: Response, next: NextFunction) => {
      authMiddleware(req, res, next).catch((err: unknown) => {
        send401Challenge(res, {
          resourceMetadataUrl: config.auth.protected_resource_metadata_url,
          error: "invalid_token",
          errorDescription:
            err instanceof Error ? err.message : "Authentication failed",
        });
      });
    });
  }

  return { app, authEnabled };
}

/**
 * Log a startup banner for an HTTP-based MCP server.
 */
export function logHttpBanner(
  config: RuntimeConfig,
  host: string,
  port: number,
  authEnabled: boolean,
): void {
  console.log(`\n  ${config.server.name}`);
  console.log(`  Listening on http://${host}:${port}`);
  console.log(`  MCP endpoint: http://${host}:${port}/mcp`);
  console.log(
    `  Protected Resource Metadata: http://${host}:${port}/.well-known/oauth-protected-resource`
  );
  console.log(`  Health: http://${host}:${port}/health`);
  if (!authEnabled) {
    console.log(`  WARNING: Auth is DISABLED. Do not use in production.`);
  }
  console.log();
}
