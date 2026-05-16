/**
 * Restore a `globalThis` property to its prior state.
 *
 * The `delete` branch is load-bearing, even though `globalThis[key] = original`
 * with `original === undefined` *looks* equivalent. They are observably
 * different states of the global object:
 *
 *     property absent       →  `'key' in globalThis === false`
 *     property === undefined →  `'key' in globalThis === true`
 *
 * That distinction matters because Jest's default environment in this repo is
 * `node`, where `requestAnimationFrame` and `cancelAnimationFrame` genuinely
 * don't exist on `globalThis` to begin with. If a test installs a mock and
 * then "restores" by reassigning `undefined`, the property is now permanently
 * present-with-value-undefined for the rest of the process, leaking state
 * into any later test (or code under test) that feature-detects via `in` or
 * `hasOwnProperty` rather than truthiness.
 *
 * Under jsdom these properties do exist as real functions, so `original` is
 * truthy and the reassignment branch runs; the `delete` branch is unreached
 * in that environment. This helper handles both cases uniformly so callers
 * can capture the prior value and restore it without thinking about which
 * environment they're in.
 * 
 * **The logic is "if it already existed, restore it; if it didn't, delete it".**
 */
export function restoreGlobal<Key extends keyof typeof globalThis>(
  key: Key,
  original: (typeof globalThis)[Key] | undefined,
): void {
  if (original) {
    globalThis[key] = original;
  } else {
    delete globalThis[key];
  }
}
