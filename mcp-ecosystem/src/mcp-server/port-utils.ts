/**
 * Returns the port from `process.env["PORT"]` if set, otherwise the given default.
 * Uses base 10 parsing.
 */
export function portFromEnvOr(defaultPort: number): number {
  return parseInt(process.env["PORT"] ?? String(defaultPort), 10);
}

/**
 * Returns the host from `process.env["HOST"]` if set, otherwise loopback.
 * Use loopback (127.0.0.1) for local development; set HOST=0.0.0.0 when
 * running behind a reverse proxy in production.
 */
export function hostFromEnvOrLoopback(): string {
  return process.env["HOST"] ?? "127.0.0.1";
}
