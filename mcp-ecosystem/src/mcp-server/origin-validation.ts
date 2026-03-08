/**
 * Predicate that decides whether a browser-supplied `Origin` header value
 * should be accepted. Return `true` to allow the request, `false` to reject
 * it with 403 Forbidden.
 *
 * Only invoked when an `Origin` header is present. Requests without the
 * header (non-browser MCP clients) are always allowed through.
 */
export type OriginValidator = (origin: string) => boolean;

/**
 * Reject every request that carries an `Origin` header.
 *
 * This is the **default** policy. Non-browser MCP clients (Claude Desktop,
 * Cursor, CLI tools, etc.) do not send `Origin`, so they are unaffected.
 * Browser-initiated requests — including DNS rebinding attempts — are blocked.
 */
export function denyAllOrigins(): OriginValidator {
  return () => false;
}

const LOCAL_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Allow origins that resolve to `localhost` or `127.0.0.1`.
 *
 * Useful during local development with browser-based MCP tools such as
 * the MCP Inspector.
 */
export function allowLocalOrigins(): OriginValidator {
  return (origin) => LOCAL_ORIGIN_RE.test(origin);
}

/**
 * Allow only the exact origin strings in the provided list.
 *
 * @example
 * ```ts
 * origin: allowOrigins(["https://app.example.com", "https://staging.example.com"])
 * ```
 */
export function allowOrigins(origins: string[]): OriginValidator {
  const allowed = new Set(origins);
  return (origin) => allowed.has(origin);
}
