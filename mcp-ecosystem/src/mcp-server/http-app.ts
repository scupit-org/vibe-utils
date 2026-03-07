import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  createAuthMiddleware,
  type AuthMiddlewareOptions,
} from "../mcp-runtime/auth-middleware.js";
import { send401Challenge } from "../mcp-runtime/www-authenticate.js";
import type { RuntimeConfig } from "./create-server.js";

export interface HttpAppContext {
  app: express.Express;
  authEnabled: boolean;
}

/**
 * Build an Express app with the shared infrastructure that all HTTP-based
 * MCP transports need:
 *
 * - JSON body parsing
 * - Protected Resource Metadata at `/.well-known/oauth-protected-resource`
 * - Health check at `/health`
 * - Auth middleware on `/mcp` (when enabled)
 *
 * The caller is responsible for attaching the transport-specific POST/GET/DELETE
 * handlers for `/mcp` to the returned `app`.
 */
export function buildHttpApp(
  config: RuntimeConfig,
  authEnabled: boolean,
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
  port: number,
  authEnabled: boolean,
): void {
  console.log(`\n  ${config.server.name}`);
  console.log(`  Listening on http://127.0.0.1:${port}`);
  console.log(`  MCP endpoint: http://127.0.0.1:${port}/mcp`);
  console.log(
    `  Protected Resource Metadata: http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
  );
  console.log(`  Health: http://127.0.0.1:${port}/health`);
  if (!authEnabled) {
    console.log(`  WARNING: Auth is DISABLED. Do not use in production.`);
  }
  console.log();
}
