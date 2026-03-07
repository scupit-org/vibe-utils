import type { IncomingMessage, ServerResponse } from "node:http";

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
  resource_documentation?: string;
}

export interface ProtectedResourceMetadataOptions {
  resourceUri: string;
  authorizationServerUri: string;
  scopes?: string[];
}

export function buildProtectedResourceMetadata(
  options: ProtectedResourceMetadataOptions
): ProtectedResourceMetadata {
  return {
    resource: options.resourceUri,
    authorization_servers: [options.authorizationServerUri],
    ...(options.scopes &&
      options.scopes.length > 0 && {
        scopes_supported: options.scopes,
      }),
    bearer_methods_supported: ["header"],
  };
}

/**
 * Express/Connect-compatible middleware that serves the Protected Resource
 * Metadata document at `/.well-known/oauth-protected-resource`.
 */
export function protectedResourceMetadataHandler(
  metadata: ProtectedResourceMetadata
) {
  const body = JSON.stringify(metadata);

  return (req: IncomingMessage, res: ServerResponse, next?: () => void) => {
    if (req.url === "/.well-known/oauth-protected-resource") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      });
      res.end(body);
      return;
    }
    next?.();
  };
}
