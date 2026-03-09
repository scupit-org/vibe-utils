import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { TokenValidator, InsufficientScopeError } from "./token-validator.js";
import { send401Challenge } from "./www-authenticate.js";

export interface AuthMiddlewareOptions {
  resourceUri: string;
  resourceMetadataUrl: string;
  issuer: string;
  audience: string | string[];
  jwksUri?: string;
}

/**
 * Creates an Express/Connect-compatible middleware that validates bearer tokens.
 *
 * On success, attaches `req.auth` as an {@link AuthInfo} object conforming to the
 * MCP SDK's expected shape. The Auth0 `sub` claim (stable user ID) is stored in
 * `req.auth.extra.sub` and is accessible in tool handlers via `extra.authInfo.extra.sub`.
 * On failure, sends a proper 401 WWW-Authenticate challenge per MCP spec.
 *
 * NOTE: This middleware sets `req.auth` before the transport route runs. We assume
 * the MCP SDK's StreamableHTTPServerTransport reads `req.auth` from the request
 * and passes it through to tool/resource/prompt handlers as `extra.authInfo`. If
 * auth ever fails to reach handlers, verify that the SDK's handleRequest() wires
 * req.auth into the handler context.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const validator = new TokenValidator({
    issuer: options.issuer,
    audience: options.audience,
    jwksUri: options.jwksUri,
  });

  return async (
    req: IncomingMessage & { auth?: AuthInfo },
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

      // azp (authorized party) is the OAuth client/application ID. Prefer it over
      // aud since aud may be the resource server URI rather than the client ID.
      const azp = typeof payload["azp"] === "string" ? payload["azp"] : undefined;
      const audFallback = typeof payload.aud === "string"
        ? payload.aud
        : Array.isArray(payload.aud)
          ? (payload.aud.find((a): a is string => typeof a === "string") ?? "")
          : "";

      const authInfo: AuthInfo = {
        token,
        clientId: azp ?? audFallback,
        scopes: typeof payload.scope === "string"
          ? payload.scope.split(" ").filter(Boolean)
          : [],
        expiresAt: payload.exp,
        extra: { sub: payload.sub },
      };

      (req as IncomingMessage & { auth: AuthInfo }).auth = authInfo;
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
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    next?: (err?: unknown) => void
  ) => {
    const auth = req.auth;
    if (!auth) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const tokenScopes = new Set(auth.scopes);

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
