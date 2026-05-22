/**
 * Progressive-enhancement helpers for deciding whether the heavy 3D experience
 * should run, and for marking the document when it does.
 *
 * The library is designed so the same build-time-generated markup can render
 * three ways from one HTML document:
 *
 * - **Full** — JavaScript runs and builds the CSS3D navigation.
 * - **No-JS** — JavaScript is disabled or fails; the page degrades to a plain,
 *   readable, scrollable document.
 * - **Lite presentation** — a deliberately graphically-light variant (e.g.
 *   served at `lite.example.com`) that carries `class="lite-version"` on
 *   `<html>` and skips the 3D layer for performance, even with JS available.
 *
 * The `engine.css` stylesheet scopes its gated 3D rules under
 * `html.{@link ENHANCED_CLASS}`, so the destructive viewport/clip/hide rules
 * only apply once that class is present. (The always-on structural hides live
 * in `base.css`.) These helpers govern the class.
 *
 * NOTE: "lite presentation" (this no-3D fallback) is unrelated to the "lite
 * backend" (`@scupit/web-3d-panel-navigation/lite-backend`), which is a small
 * three-free *renderer* for the full 3D experience.
 */

/** Class added to `<html>` when the interactive 3D experience is active. */
export const ENHANCED_CLASS = 'w3dpn-enhanced';

/** Class a consumer puts on `<html>` to opt out of the 3D experience. */
export const LITE_VERSION_CLASS = 'lite-version';

/**
 * Whether the interactive 3D experience should run. Returns `false` when the
 * document is flagged as a lite presentation (`<html class="lite-version">`).
 *
 * Recommended usage gates construction so the heavy backend never boots in
 * lite mode:
 *
 * ```ts
 * import { ZoomPlaneNavigator, resolveContainerRefs, shouldEnhance } from '@scupit/web-3d-panel-navigation';
 * import { liteBackend } from '@scupit/web-3d-panel-navigation/lite-backend';
 *
 * if (shouldEnhance()) {
 *   new ZoomPlaneNavigator(resolveContainerRefs(), liteBackend);
 * }
 * ```
 */
export function shouldEnhance(doc: Document = document): boolean {
  return !doc.documentElement.classList.contains(LITE_VERSION_CLASS);
}

/**
 * Adds {@link ENHANCED_CLASS} to `<html>`, activating the gated `engine.css`
 * rules. Idempotent. The navigator calls this on construction, but for a
 * flash-free load you should also run the equivalent inline snippet in
 * `<head>` so the class is present before first paint:
 *
 * ```html
 * <script>
 *   if (!document.documentElement.classList.contains('lite-version'))
 *     document.documentElement.classList.add('w3dpn-enhanced');
 * </script>
 * ```
 */
export function markEnhanced(doc: Document = document): void {
  doc.documentElement.classList.add(ENHANCED_CLASS);
}
