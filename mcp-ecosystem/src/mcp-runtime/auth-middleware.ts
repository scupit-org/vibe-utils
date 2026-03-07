import type { IncomingMessage, ServerResponse } from "node:http";
import { TokenValidator, InsufficientScopeError } from "./token-validator.js";
import { send401Challenge } from "./www-authenticate.js";

export interface AuthMiddlewareOptions {
  resourceUri: string;
  resourceMetadataUrl: string;
  issuer: string;
  audience: string;
  jwksUri?: string;
}

/**
 * Creates an Express/Connect-compatible middleware that validates bearer tokens.
 *
 * On success, attaches `req.auth` with the validated token claims.
 * On failure, sends a proper 401 WWW-Authenticate challenge per MCP spec.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const validator = new TokenValidator({
    issuer: options.issuer,
    audience: options.audience,
    jwksUri: options.jwksUri,
  });

  return async (
    req: IncomingMessage & { auth?: unknown },
    res: ServerResponse,
    next?: (err?: unknown) => void
  ) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      send401Challenge(res, {
        resourceMetadataUrl: options.resourceMetadataUrl,
        error: "invalid_request",
        errorDescription: "Missing or malformed Authorization header",
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = await validator.validate(token);
      (req as IncomingMessage & { auth: unknown }).auth = payload;
      next?.();
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        send401Challenge(res, {
          resourceMetadataUrl: options.resourceMetadataUrl,
          requiredScopes: err.requiredScopes,
          error: "insufficient_scope",
          errorDescription: err.message,
        });
        return;
      }

      send401Challenge(res, {
        resourceMetadataUrl: options.resourceMetadataUrl,
        error: "invalid_token",
        errorDescription:
          err instanceof Error ? err.message : "Token validation failed",
      });
    }
  };
}

/**
 * Factory for route-level scope enforcement middleware.
 *
 * Usage:
 *   app.post('/tools/execute', requireScopes(['tools.write']), handler);
 */
export function requireScopes(scopes: string[]) {
  return (
    req: IncomingMessage & { auth?: Record<string, unknown> },
    res: ServerResponse,
    next?: (err?: unknown) => void
  ) => {
    const auth = req.auth;
    if (!auth) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const tokenScopes = new Set<string>();
    if (typeof auth["scope"] === "string") {
      for (const s of (auth["scope"] as string).split(" ")) {
        if (s) tokenScopes.add(s);
      }
    }
    if (Array.isArray(auth["permissions"])) {
      for (const p of auth["permissions"] as string[]) {
        if (typeof p === "string") tokenScopes.add(p);
      }
    }

    const hasSufficientScope = scopes.some((s) => tokenScopes.has(s));
    if (!hasSufficientScope) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "insufficient_scope",
          required_scopes: scopes,
        })
      );
      return;
    }

    next?.();
  };
}
