---
name: measure-bundles
description: Run the web-3d-panel-navigation bundle measurement script and interpret its output. Covers the closed-bundle minified totals, the lite-vs-three comparison, the per-file breakdown table, and the pass/fail assertions. Use when the user asks to measure bundle size, check file size contribution, verify tree-shaking, investigate why a bundle is a given size, or mentions scripts/measure-bundles.mjs.
---

# Measure Bundles

How to run `scripts/measure-bundles.mjs` and read its output.

## Purpose

`scripts/measure-bundles.mjs` bundles a fixed set of consumer-shaped entry points with esbuild directly against `src/`, then reports minified bytes and per-file contribution for each. It serves two roles at once: surfacing bundle composition to humans, and enforcing budgets and tree-shaking assertions that fail the process on regressions. It reads source directly, so `npm run build` is not required first.

## Prerequisites

- Run `npm install` once if `node_modules/` is missing (the script depends on esbuild).
- Invoke from the `web-3d-panel-navigation/` project root so the script's relative paths to `src/` resolve.

## How to run

```bash
node ./scripts/measure-bundles.mjs
```

Exit code is `0` on success and `1` if any budget or content assertion fails.

## What the output sections mean

Section headers below match stdout verbatim.

### `=== Lite renderers ===`

Closed-bundle minified bytes for each lite-backend consumer shape: `ZoomPlaneNavigator` only, navigator + gradient skybox, navigator + starfield skybox, and the two standalone-skybox variants that use `LiteSkyboxHost` directly. These are the floor measurements for the three-free path.

### `=== Three-backed renderers ===`

The same consumer shapes but built against the three-backend factory. Expected to include three's `WebGLRenderer`, `Scene`, and math primitives, so totals here are dominated by three.

### `=== Lite vs three comparison ===`

Pair-by-pair `Delta` (three bytes minus lite bytes) and `Ratio` (three bytes divided by lite bytes). This is the headline "how much does three cost us" number for each shape.

### `=== Per-file breakdown: <entry> ===`

Rendered only for entries flagged `perFileBreakdown: true` in the script. Currently that is the `nav-lite-starfield` entry — the "full functionality, lite backend" use case. Two numeric columns:

- **Bundle bytes** — esbuild metafile `bytesInOutput`. Post-tree-shake, pre-minify contribution to the closed bundle. Use this to rank who-pays-what in a real consumer bundle.
- **Self min** — `esbuild.transform({ minify: true })` of the file's source alone, with no dependencies and no tree-shaking. Use this as a stable per-file reference that does not move when unrelated callers change their imports.

### `OK: all bundle assertions passed.` / `FAIL: ...`

Result of the per-entry assertions (see "Pass / fail behavior" below). On failure, surface the `FAIL:` lines verbatim to the user before suggesting remediation.

## Reading the per-file table

- Rows are sorted by Bundle bytes descending — the top of the table is the highest cost.
- `0` in Bundle bytes with a nonzero Self min means esbuild fully tree-shook the file's exports out of the bundle. This is typical for barrel `index.ts` files: the file still exists on disk but contributes nothing to this bundle.
- The Bundle bytes total will be slightly less than the closed minified total reported above, because Bundle bytes is pre-minify and excludes esbuild's small bundle prelude/runtime which is not attributed to any input.

## Pass / fail behavior

Two assertion classes are configured per entry inside the script:

- `budgetBytes` — the closed minified bundle must not exceed this size. Catches regressions.
- `mustContain` / `mustNotContain` — regexes evaluated against the minified bundle text. Used to fingerprint expected dependencies (e.g. the `THREE.WebGL` string literal must appear in three-backed entries) and to forbid leaks (e.g. `THREE.WebGL` must NOT appear in lite entries, and the `CSS3DRenderer`'s `translate3d(-50%,-50%,0)` template literal must NOT appear in standalone-skybox bundles that should not pull in the navigator core).

When any assertion fails, the script prints one `FAIL:` line per violation and exits `1`.
