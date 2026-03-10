/**
 * Returns the value if it is a non-empty, non-whitespace string; otherwise null.
 */
export function getPopulatedStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
