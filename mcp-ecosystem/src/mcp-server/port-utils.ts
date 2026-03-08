/**
 * Returns the port from `process.env["PORT"]` if set, otherwise the given default.
 * Uses base 10 parsing.
 */
export function portFromEnvOr(defaultPort: number): number {
  return parseInt(process.env["PORT"] ?? String(defaultPort), 10);
}
