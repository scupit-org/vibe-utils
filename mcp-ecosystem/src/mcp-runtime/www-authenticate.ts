import type { ServerResponse } from "node:http";

export interface ChallengeOptions {
  resourceMetadataUrl: string;
  requiredScopes?: string[];
  error?: string;
  errorDescription?: string;
}

/**
 * Build a WWW-Authenticate header value conforming to MCP's authorization spec.
 *
 * MCP requires servers to include `resource_metadata` in the challenge,
 * and recommends including `scope` when applicable.
 */
export function buildWwwAuthenticateChallenge(
  options: ChallengeOptions
): string {
  const parts: string[] = ["Bearer"];
  const params: string[] = [];

  params.push(`resource_metadata="${options.resourceMetadataUrl}"`);

  if (options.requiredScopes && options.requiredScopes.length > 0) {
    params.push(`scope="${options.requiredScopes.join(" ")}"`);
  }

  if (options.error) {
    params.push(`error="${options.error}"`);
  }

  if (options.errorDescription) {
    params.push(`error_description="${options.errorDescription}"`);
  }

  if (params.length > 0) {
    parts.push(params.join(", "));
  }

  return parts.join(" ");
}

/**
 * Send a 401 response with a proper WWW-Authenticate challenge.
 */
export function send401Challenge(
  res: ServerResponse,
  options: ChallengeOptions
): void {
  const challenge = buildWwwAuthenticateChallenge(options);
  res.writeHead(401, {
    "WWW-Authenticate": challenge,
    "Content-Type": "application/json",
  });
  res.end(
    JSON.stringify({
      error: options.error ?? "unauthorized",
      error_description:
        options.errorDescription ?? "Authentication required",
    })
  );
}
