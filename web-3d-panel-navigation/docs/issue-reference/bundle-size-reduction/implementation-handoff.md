# Custom Skybox Renderer + Math Primitives — Implementation Handoff

## Summary

This document hands off a two-phase implementation effort to dramatically shrink the bundle size of `@scupit/web-3d-panel-navigation`. The goal is to make the navigator + skybox path cheap enough to ship in bundle-sensitive websites without dragging in the ~272 KB three.js floor.

The migration is intentionally split into two stages so each stage produces a working, verifiable result:

1. **Phase 1** — Implement a lite WebGL2 skybox renderer (`src/skybox/lite/`) that is functionally equivalent to the existing three-backed `SkyboxHost` for the two skybox flavors we care about now: **gradient** and **starfield**. Phase 1 keeps using `three`'s math types (`Vector3`, `Matrix4`, `Euler`, `Quaternion`, `MathUtils`) so the renderer can be written and verified without simultaneously rewriting the math foundation.

2. **Phase 2** — Replace `three`'s math/scene-graph types (`Vector3`, `Euler`, `Quaternion`, `Matrix4`, `Object3D`, `Scene`, `Camera`, `PerspectiveCamera`, `MathUtils`) with in-house equivalents across the entire `src/` tree. This is what removes the 229 KB three-core floor from the navigator path and the new lite skybox path. After Phase 2, the only `three` dependency left in the package is the legacy `src/skybox/` directory, which we keep as an opt-in escape hatch.

A future Phase 3 — a generalized pluggable interface that lets consumers swap between the lite and three backends via config — is **out of scope for this handoff**. The user will handle that themselves once Phases 1 and 2 are merged. Implementer should keep Phase 3 in mind only to the extent of not painting Phase 1/2 into a corner; see "Looking ahead to Phase 3" below.

## Background

The full investigation that produced this plan lives in this same folder:

- **`webgl-renderer-research.md`** — Research report on what a minimal custom WebGL2 skybox renderer would actually require. Required reading before starting Phase 1; it contains per-flavor implementation sketches, the recommended camera-math approach, coexistence gotchas, and explicit decisions like "raw WebGL2, not regl/twgl" and "no scene graph for the skybox layer." This handoff defers to that document for technical specifics and does not duplicate them.

Bundle-size measurements that motivated this work (taken on `develop` after the named-imports + `minify: true` changes already shipped):

| Consumer entry | Minified bytes |
| --- | --- |
| `ZoomPlaneNavigator` only (CSS3D, no skybox) | 271,883 |
| `ZoomPlaneNavigator` + any skybox flavor | ~502,000 |
| Just `WebGLRenderer` from three | 495,923 |
| Just `Vector3` (or any single three symbol) | 229,570 |

The structural conclusion: tree-shaking is already doing all it can. The remaining wins require reducing what we *import from `three`*, which means replacing it for the parts we can.

Related historical context lives in `../firefox-panel-rendering/`. The Firefox CSS3D rendering issue is independent of this work, but the CSS3D coexistence checklist in the research doc was informed partly by what was learned during that investigation; if you hit anything weird with the WebGL canvas sitting behind CSS3D-transformed DOM, that folder is a useful reference.

## Goals and non-goals

### Goals

- A lite WebGL2-backed skybox renderer that produces visually equivalent output to the current three-backed `createGradientSkybox` and `createStarfieldSkybox` (Phase 1 acceptance: side-by-side visual parity in a local example harness).
- A custom math/scene-graph layer that the CSS3D renderer and the new lite skybox both consume, with `three` no longer imported anywhere outside `src/skybox/` (the legacy directory).
- Bundle-size reduction: target `ZoomPlaneNavigator` + lite-starfield consumer bundles in the **15–30 KB minified** range after Phase 2 completes, down from ~502 KB today. (This is an order-of-magnitude target; exact numbers will fall out of implementation.)
- Both backends coexist in the package after Phase 1: the legacy `src/skybox/` (three-backed) and the new `src/skybox/lite/` (custom). Phase 3 will unify the public API; until then, two parallel exports is fine.

### Non-goals

- **Cubemap and equirectangular panorama lite skyboxes.** Out of scope for Phase 1. Consumers who need those keep using the three-backed `createImageSkybox` / `createPanoramaSkybox`. Revisit later if there's actual demand.
- **WebGL1 fallback.** Target is WebGL2 only. Browser support is wide enough (Chrome 56+, Firefox 51+, Safari 15+, ~95% global), and adding WebGL1 fallbacks roughly doubles the plumbing complexity (NPOT restrictions, extension negotiation, older shader syntax). Per research recommendation.
- **HDR / RGBE / EXR panoramas, environment lighting semantics, PMREM.** These are explicitly the reason the three-backed path stays around.
- **Replacing `three` in the legacy `src/skybox/` directory.** Those files keep importing `three` and remain the escape hatch.
- **The generalized backend-swapping interface (Phase 3).** Implementer should not build a backend abstraction or unified factory API; the user is handling that step.

## Migration plan at a glance

```
Phase 1: Lite skybox renderer (uses three for math)
   ├── Implement src/skybox/lite/ — gradient + starfield + plumbing
   ├── Add subpath export @scupit/web-3d-panel-navigation/skybox-lite
   ├── Visual parity verification on sky-site
   └── three is still a runtime dependency of the lite renderer (for now)

Phase 2: Custom math/scene-graph primitives
   ├── Implement src/math/ (or similar) — Vector3, Euler, Quaternion, Matrix4, MathUtils
   ├── Implement src/scene/ (or similar) — Object3D-equivalent, Scene-equivalent, PerspectiveCamera-equivalent
   ├── Migrate src/css3d-renderer.ts, src/scene-graph.ts, src/camera-controller.ts,
   │   src/camera-transitions.ts, src/overview-camera.ts, src/projection.ts,
   │   src/zoom-plane-parser.ts, src/types.ts, src/skybox/lite/* off three
   ├── Leave src/skybox/ (legacy) on three
   └── three becomes a peer-dep needed only by the legacy skybox subpath
```

---

## Phase 1: Lite skybox renderer

### Decisions already made

| Decision | Value | Source |
| --- | --- | --- |
| GL target | WebGL2 | Research §"Executive summary" |
| Helper library | None (raw WebGL2) | Research §"Executive summary" |
| Flavors shipped initially | Gradient + starfield only | User decision in handoff prep |
| File location | `src/skybox/lite/` (nested under existing skybox dir) | User decision in handoff prep |
| Public import path | `@scupit/web-3d-panel-navigation/skybox-lite` | User decision in handoff prep |
| Camera math approach | Pass camera basis vectors (`forward`/`right`/`up`) per frame, reconstruct rays in fragment shader | Research §"Recommended architecture" |
| Scene graph | None — fixed pass list (gradient pass, optional starfield pass on top) | Research §"Executive summary" |
| Color handling for gradient | Linearize sRGB inputs before mixing in shader | Research §"Per-flavor implementation sketches — Gradient" |
| Starfield blending | Additive, matching current `THREE.AdditiveBlending` configuration | Research §"Per-flavor implementation sketches — Starfield" |

### File structure to add

One workable layout below — flatten if it feels heavy for two flavors. The directory split is a suggestion, not a requirement, and esbuild is happy either way.

```
src/skybox/lite/
  index.ts                 — public exports: createGradientSkybox, createStarfieldSkybox, LiteSkyboxHost, types
  lite-skybox-host.ts      — class LiteSkyboxHost (analogous to existing SkyboxHost but for WebGL2 + LiteSkybox)
  gl/                      — minimal raw-WebGL2 plumbing
    context.ts             — context creation, alpha/premul/powerPreference options
    program.ts             — shader compile + program link helpers
    buffer.ts              — VBO/VAO helpers (only needed by starfield)
    resize.ts              — DPR clamping, drawingBuffer size, viewport update
    error.ts               — minimal getError + shader info-log surfacing
  passes/
    gradient-pass.ts       — fullscreen triangle, 3-color procedural gradient
    starfield-pass.ts      — gl.POINTS draw over an existing gradient pass
  factories/
    gradient-skybox.ts     — createGradientSkybox(options): LiteSkybox  (gradient pass only)
    starfield-skybox.ts    — createStarfieldSkybox(options): LiteSkybox  (gradient + starfield)
  shaders/
    gradient.vert.glsl     — or inline string in gradient-pass.ts
    gradient.frag.glsl
    starfield.vert.glsl
    starfield.frag.glsl
  lite-skybox.ts           — interface LiteSkybox, SkyboxFrame, etc.
```

For Phase 1 alone, a flat `src/skybox/lite/{lite-skybox-host,gradient,starfield,gl,lite-skybox}.ts` would also be reasonable.

Whether to keep shaders as separate `.glsl` files or inline strings is up to the implementer; both work with esbuild. Inline strings are simpler for a small set; separate files make shader editing nicer with extensions like glsl-canvas. **Recommend inline for Phase 1** — fewer build moving parts.

### API contracts

These are the contracts to implement. They intentionally do not mirror the legacy `Skybox` interface (which has a `root: Object3D` field that hard-encodes a scene-graph dependency). Phase 3 will reconcile them; for now keep them separate.

```ts
// src/skybox/lite/lite-skybox.ts

import type { PerspectiveCamera } from 'three'; // PHASE 1 ONLY; remove in Phase 2

/**
 * One-way snapshot of camera + viewport state for a single frame.
 * The host computes this each frame from its camera and viewport,
 * and hands it to every active lite skybox.
 */
export interface SkyboxFrame {
  /** CSS pixel viewport size (matches canvas style width/height). */
  widthCss: number;
  heightCss: number;
  /** Backing-buffer pixel size (CSS * clamped DPR). */
  widthPx: number;
  heightPx: number;
  /** Vertical field of view in radians. */
  fovY: number;
  /** widthCss / heightCss. */
  aspect: number;
  /** Monotonic ms since host start, for animation uniforms. */
  time: number;
  /** ms since last frame. */
  dt: number;
  /** Camera basis in world space. Normalized. */
  forward: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
}

// Note: world-space camera position is intentionally absent — neither gradient nor
// starfield needs it. If future flavors (some panorama tricks) need it, add the
// field then; the host already holds the camera reference and can extend the frame
// trivially.

export interface LiteSkybox {
  /**
   * Called once after the host owns a context. Compile shaders, upload buffers,
   * allocate textures. Throw on unrecoverable setup failure.
   */
  init(gl: WebGL2RenderingContext): void;
  /** Issue draw calls. May be called every rAF (starfield) or on-invalidate (static flavors). */
  render(frame: SkyboxFrame): void;
  /** Re-read CSS-variable inputs and other deferred config. Optional. */
  refresh?(): void;
  /** Release GL resources. After dispose() the host treats this object as dead. */
  dispose(): void;
}

// Phase 1: host accepts three's PerspectiveCamera and extracts basis vectors itself.
// Phase 2: replace with the custom camera type.
export interface LiteSkyboxHostOptions {
  camera: PerspectiveCamera;
  mount: HTMLElement;
  skybox: LiteSkybox;
  canvasId?: string;
  /** Hex/integer/CSS-string color used for the canvas clear. Default black. */
  clearColor?: number | string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  antialias?: boolean;
  powerPreference?: WebGLPowerPreference;
  pixelRatio?: number | ((devicePixelRatio: number) => number);
  autoStart?: boolean;
  externalFrameLoop?: boolean;
}
```

`LiteSkyboxHost`'s public method surface should mirror the existing `SkyboxHost` so swapping it into `sky-site` is a one-line change in `sky-site/src/home/home.ts`:

```ts
start(): void;
stop(): void;
setSkybox(next: LiteSkybox): void;
setPixelRatio(pixelRatio?: ...): void;
renderFrame(dt?: number): void;
refresh(): void;
destroy(): void;
```

Internally, `LiteSkyboxHost`:

1. Creates a `<canvas>` and gets a WebGL2 context. If `getContext("webgl2")` returns `null`, throw a clear error in Phase 1 — no WebGL1 fallback.
2. Owns the rAF loop, `visibilitychange` handling, resize listener — pattern-match the existing `SkyboxHost` exactly (see `src/skybox/skybox-host.ts`); the lifecycle requirements are identical.
3. Each frame: compute `SkyboxFrame` from the camera and the canvas backing dimensions, then call `skybox.render(frame)`.
4. Handle `webglcontextlost` / `webglcontextrestored` events (research §"CSS3D coexistence checklist"). On restore, call `skybox.dispose()` then `skybox.init(gl)` to rebuild resources.

### Per-flavor implementation notes

The research doc covers technical detail; this list adds project-specific notes.

#### Gradient

- Match the visual behavior of `src/skybox/gradient-mesh.ts` exactly. Same three CSS variables (`--skybox-color-a`, `--skybox-color-b`, `--skybox-color-c`), same fallback hex colors, same direction vector default `[1.0, 0.6, 0.4]`, same two-stop mix in the fragment shader.
- The current implementation accepts colors either as a `[string, string, string]` tuple or by reading CSS variables via `readCssColor`. **Move `readCssColor` to a shared util (not three-dependent)** because Phase 2's custom math layer should also expose it. For Phase 1 only: a lite-local copy is fine — just make sure it doesn't reach back into `src/skybox/css-color.ts` which still imports `three.Color`.
- Three's `Color` linearizes sRGB string/hex inputs on construction, and three's `WebGLRenderer` re-encodes linear → sRGB on output (its `outputColorSpace` defaults to `SRGBColorSpace`). Visual parity needs both conversions: linearize inputs with `pow(c, 2.2)`, mix in linear, then `pow(color, 1.0/2.2)` before writing `gl_FragColor`. The cheap `pow()` approximations are sufficient; full piecewise sRGB is overkill. Verify side-by-side.
- Single fullscreen triangle via `gl_VertexID` (WebGL2). No vertex buffer needed.

#### Starfield

- Match `src/skybox/starfield-skybox.ts` defaults: 2500 stars, base size 3.5, twinkle freq 1.5, radius 0.95, warm/cool color CSS vars, same warm-biased tint distribution (`Math.pow(Math.random(), 1.8)`).
- The starfield is layered on top of a gradient. `createStarfieldSkybox` in this lite implementation should compose: instantiate an internal gradient pass plus a starfield pass and render them in order each frame. **Do not require the consumer to manually compose** — match the existing factory ergonomics.
- Use a single VBO with interleaved attributes (position xyz, phase, brightness, tint) — 6 floats per vertex, 2500 vertices ≈ 60 KB upload at startup, cheap.
- Vertex shader: apply perspective projection plus rotation-only view matrix (no translation — the starfield must feel "at infinity"). Set `gl_PointSize` based on brightness and a `uPixelRatio` uniform, same as today's three implementation.
- Fragment shader: `gl_PointCoord`-based circular falloff, twinkle from `uTime`, warm/cool color mix from `aTint`. Additive blending: `gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);` paired with `premultipliedAlpha: true` on the canvas context. This is the combination three uses when its renderer is configured with `premultipliedAlpha: true` (the default, inherited by the existing `SkyboxHost`). If `premultipliedAlpha: false` is chosen instead, blend factors must change to `gl.SRC_ALPHA, gl.ONE, gl.SRC_ALPHA, gl.ONE` to stay visually consistent.
- The current implementation calls `group.position.copy(camera.position)` in `update()` to make the gradient cube follow the camera. The lite implementation doesn't need this because the gradient is a fullscreen pass (no cube object) and the starfield uses rotation-only view (no translation to follow).

### Integration & coexistence

The research doc's "CSS3D coexistence checklist" is the authoritative reference. Quick summary of the things that *must* be right or rendering will break:

- Canvas is a **sibling** of the CSS3D root, not a child of any transformed/filtered ancestor. `position: fixed; inset: 0; z-index: 0; pointer-events: none`.
- Default canvas options: `alpha: true, premultipliedAlpha: true`, shader writes `alpha = 1.0` for opaque skies. `alpha: false` is a known footgun on some platforms (research §"CSS3D coexistence checklist").
- DPR clamp: default `Math.min(window.devicePixelRatio, 1.5)`. Match the existing `SkyboxHost.resolvePixelRatio` behavior.
- On every resize: update canvas backing size, then call `gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)`. Use `drawingBufferWidth/Height` (not the requested size) when computing resolution-dependent uniforms.
- `visibilitychange`: same pause/resume as existing `SkyboxHost`. On resume reset `lastTime` so accumulated `dt` doesn't blow up.
- `webglcontextlost` / `webglcontextrestored`: call `event.preventDefault()` on context-lost to opt into restore. On restored, rebuild all GL resources via `skybox.dispose() + skybox.init(gl)`. Mobile + long-lived tab sessions hit this.

### Subpath export wiring

Add to `package.json`:

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "import": "./dist/index.js"
  },
  "./skybox-lite": {
    "types": "./src/skybox/lite/index.ts",
    "import": "./dist/skybox-lite.js"
  },
  "./styles.css": "./dist/styles.css"
}
```

Update `scripts/build.mjs` to emit a second entry point (`src/skybox/lite/index.ts` → `dist/skybox-lite.js`) alongside `dist/index.js`. The new entry should also emit a source map (`sourcemap: true`, matching the existing `dist/index.js` build configuration) — without it, debugging the lite renderer through bundled output is painful. Both entries still externalize `three` in Phase 1. Verify after building that the lite bundle does **not** transitively re-export anything from `src/skybox/` (the legacy three-backed flavors). The two skybox paths must be independently tree-shakable.

`package.json` `peerDependencies` is unchanged in Phase 1 — `three` stays a required peer because both the navigator (still on three) and the new lite renderer (using three for math) depend on it. The question of making `three` optional or split-by-subpath belongs to Phase 2, once the navigator and lite renderer no longer transitively need it.

### Phase 1 acceptance criteria

1. `npm run build` succeeds and produces both `dist/index.js` and `dist/skybox-lite.js`.
2. `npm test` passes (the existing 50 tests should be untouched — Phase 1 adds files, doesn't modify existing ones except for `scripts/build.mjs` and `package.json`).
3. Importing `createGradientSkybox` and `createStarfieldSkybox` from `@scupit/web-3d-panel-navigation/skybox-lite` produces visually equivalent output to importing the same-named factories from the package root, verified side-by-side using a **local example harness** (extend `example/main.ts` or add a new HTML page under `example/` that mounts both backends in a split view). The package is treated as fully standalone; verifying against the external `sky-site` project is optional post-merge follow-up, not a Phase 1 acceptance gate.
4. **Sanity check, not the bundle-size victory.** Phase 1 still imports `three` for math, so the navigator's ~272 KB floor is intact and the lite renderer only adds its own code on top. The real bundle-size win lands in Phase 2 (target 15–30 KB). The Phase 1 measurement confirms the subpath export is wired correctly and that the lite renderer hasn't accidentally pulled in three's WebGL stack (`WebGLRenderer`, `ShaderMaterial`, etc. would add ~230 KB and immediately fail this budget). Concretely: minified bundle size for an entry that imports `ZoomPlaneNavigator` + `LiteSkyboxHost` + `createStarfieldSkybox` should be **under 290 KB** (~272 KB navigator floor + ~5–8 KB lite renderer + ~10 KB headroom).
5. The `webglcontextlost` / `webglcontextrestored` path is exercised — at minimum manually via the `WEBGL_lose_context` extension fired from devtools — and the starfield reappears without a page reload. Optional: add a temporary button to the example harness that toggles context loss, for repeatable testing.

---

## Phase 2: Custom math / scene-graph primitives

### Scope

Replace all use of `three`'s math and scene-graph types across the entire `src/` tree **except** `src/skybox/` (legacy). After Phase 2, only `src/skybox/` (and its dependants) imports from `three`.

### Symbols to replace

| three symbol | Where used (post-Phase 1) | Replacement strategy |
| --- | --- | --- |
| `Vector3` | `camera-controller.ts`, `camera-transitions.ts`, `overview-camera.ts`, `projection.ts`, `zoom-plane-parser.ts`, `types.ts`, `skybox/lite/*` | Custom `Vec3` class. Mutating API (`clone`, `copy`, `set`, `add`, `sub`, `subVectors`, `multiplyScalar`, `addScaledVector`, `dot`, `cross`, `normalize`, `length`, `lengthSq`, `distanceTo`, `lerpVectors`, `applyEuler`, `applyQuaternion`, `project`) modeled on three's so the call-site diffs are minimal. `clone` is used widely — verify it's available before anything else. |
| `Euler` | `camera-controller.ts`, `overview-camera.ts`, `projection.ts`, `zoom-plane-parser.ts` | Custom `Euler` class with `x, y, z, order`, `setFromQuaternion`, `set` methods. Default 'XYZ' order (matches three default). |
| `Quaternion` | `zoom-plane-parser.ts`, tests | Custom `Quaternion`. Methods needed: `setFromEuler`, `setFromAxisAngle`, `multiply`, `clone`, `dot`, `applyQuaternion` (the Vec3 method consumes these). |
| `Matrix4` | `css3d-renderer.ts` (parameter types only, `.elements` array reads), `camera-transitions.ts` indirectly via Camera | Custom `Mat4` class with `elements: Float32Array(16)`, `copy`, `invert`, plus whatever the CSS3D renderer reads. The renderer uses `matrix.elements[0..15]` directly, so as long as the Float32Array layout matches three's column-major, the CSS path doesn't need to change. |
| `Object3D` | `css3d-renderer.ts` (CSS3DObject extends it), `scene-graph.ts` (zoomPlanes are added to scene), `types.ts` (CSS3DObjectRef), `skybox/lite/*` is not affected (no scene graph in lite) | Custom `Object3D` with `position: Vec3`, `rotation: Euler`, `scale: Vec3`, `matrix: Mat4`, `matrixWorld: Mat4`, `parent`, `children`, `add()`, `remove()`, `traverse()`, `updateMatrix()`, `updateMatrixWorld()`, `addEventListener`/`dispatchEvent` (the existing CSS3DObject listens for `'removed'`). |
| `Scene` | `scene-graph.ts`, `types.ts`, `skybox/lite/*` is not affected | Trivial — just `class Scene extends Object3D`. Maybe a `matrixWorldAutoUpdate` field (the existing CSS3D renderer reads it). |
| `Camera`, `PerspectiveCamera` | `scene-graph.ts`, `css3d-renderer.ts`, `camera-controller.ts`, `camera-transitions.ts`, `projection.ts`, `types.ts`, `skybox/lite/lite-skybox-host.ts` | Custom `PerspectiveCamera` extends `Object3D`, with `fov`, `aspect`, `near`, `far`, `projectionMatrix: Mat4`, `matrixWorldInverse: Mat4`, `updateProjectionMatrix()`, `lookAt(target: Vec3)`. The CSS3D renderer reads `projectionMatrix.elements[5]` and `matrixWorld`/`matrixWorldInverse`, so those need to match three's behavior numerically. **Must also set `isPerspectiveCamera = true` as an instance property** — `src/css3d-renderer.ts:93` reads it as a runtime tag (`if (camera.isPerspectiveCamera) ...`). Without it, the perspective style update is silently skipped. |
| `MathUtils.clamp` | `camera-transitions.ts` | Inline a tiny `clamp(n, min, max)` helper. |
| `MathUtils.DEG2RAD` | `camera-transitions.ts` | Inline `const DEG2RAD = Math.PI / 180` or use `n * Math.PI / 180`. |

### Migration approach

1. Create `src/math/` (or `src/three-lite/` — pick a name; consistency matters more than the specific choice). Implement each replacement class in its own file with focused unit tests. The `zoom-plane-parser.test.ts` and `animation-timeline.test.ts` suites already exercise Vector3/Quaternion/Euler heavily — keep those tests passing throughout the migration as the integration safety net.

2. **Numerical compatibility is non-negotiable**: the CSS3D renderer's output is mathematically derived from these matrices. Even small differences in matrix layout, Euler order, or quaternion handedness will visibly break the navigator. Write unit tests that compare the custom types' output to known-good three values for the operations the codebase actually uses. The existing parser tests will catch most regressions but they're not exhaustive.

3. Migrate files **one at a time** in an order that minimizes coupling. Suggested order:
   1. `src/math/*` exists with full coverage (and unit tests against three's outputs for the operations the codebase uses).
   2. `src/types.ts` — switch type imports to the custom layer. Easy first consumer; exposes any missing API surface.
   3. `src/skybox/lite/*` — smallest runtime consumer; visual verification is straightforward.
   4. `src/projection.ts`, `src/overview-camera.ts`, `src/zoom-plane-parser.ts` (pure-math files).
   5. `src/camera-controller.ts`, `src/camera-transitions.ts` (depends on the above).
   6. `src/css3d-renderer.ts`, `src/scene-graph.ts` (final integration — touches scene-graph types).
   7. `src/zoom-plane-parser.test.ts` and any other test file imports.

4. Keep `three` in `package.json` `peerDependencies` because `src/skybox/` (legacy) still needs it. Drop it from being a *required* import path of the main entry, though — Phase 2's success is that someone using `ZoomPlaneNavigator` + `@scupit/web-3d-panel-navigation/skybox-lite` doesn't need `three` installed at all. To enforce this, consider making `three` an `optionalPeerDependency` (per npm spec) or splitting the peer-dep into the subpath that needs it.

### Phase 2 acceptance criteria

1. `npm test` passes. All 50 existing tests + any new unit tests for the math/scene-graph layer.
2. `grep -r "from 'three'" src/` returns matches **only inside `src/skybox/`** (the legacy three-backed dir).
3. Library `dist/index.js` no longer references `three` (verifiable with `grep "from \"three\"" dist/index.js` — should return nothing if you build the main entry; matches inside `dist/skybox.js` for the legacy path are expected).
4. Minified consumer-bundle measurement for `ZoomPlaneNavigator` + lite-starfield drops to the **15–30 KB** range. Use the same measurement methodology as the bundle-size investigation earlier in this folder (build a tiny entry, run esbuild with `--minify`, measure bytes).
5. The `sky-site` homepage renders identically (panel positions, transitions, starfield) with the post-Phase-2 version of the library swapped in. This is the critical end-to-end check; the math layer is only correct if the visual output matches.

---

## Looking ahead to Phase 3

The user is handling the pluggable-backend interface themselves. The implementer of Phases 1 and 2 should not build that abstraction, but should avoid these footguns that would make Phase 3 painful:

- **Don't share types between `LiteSkybox` and the legacy `Skybox` interface.** Two parallel interfaces are simpler to unify later than to detangle a premature shared abstraction.
- **Keep the lite renderer's public factory names matching the legacy ones** (`createGradientSkybox`, `createStarfieldSkybox`). Phase 3 will likely make consumers do `import { createStarfieldSkybox } from '.../skybox-lite'` or similar — same factory name, different subpath.
- **Don't put backend selection logic anywhere.** No `if (useLite)` branches in shared code. Phase 1's lite renderer should be reachable only via the explicit `/skybox-lite` subpath import.

If Phase 3 ends up unifying via a runtime config or factory option, the user will reshape these APIs at that time.

---

## Open decisions and risks

- **Color accuracy on gradient.** Three's pipeline does *two* color-space conversions: sRGB → linear on `Color` construction and linear → sRGB on renderer output. Matching both is the default plan for visual parity. Skipping one or both is cheaper to write and may be visually acceptable — decide by side-by-side comparison, not theory.
- **WebGL2 unavailability.** All evergreen browsers support WebGL2, but locked-down corporate environments occasionally don't. **Default**: `LiteSkyboxHost` constructor throws if `canvas.getContext("webgl2")` returns `null`, with an error message that points at the three-backed `SkyboxHost` as the fallback path. The skybox is decorative, so a thrown constructor shouldn't take down the whole page — document this in `LiteSkyboxHost`'s JSDoc and recommend that consumers wrap construction in try/catch and treat the skybox as optional (mirroring the existing pattern in `sky-site/src/home/home.ts`).
- **Local verification, not cross-project.** Visual parity is verified inside this package's `example/` tooling, not against the external `sky-site` project. The Firefox/Windows-scaling rendering bug documented in `../firefox-panel-rendering/` is a CSS3D issue, not a WebGL one, and should not interact with this work. If new oddities appear once the lite renderer is mounted, suspect canvas layering or DPR clamping first.
- **`readCssColor` ownership.** Currently in `src/skybox/css-color.ts` and depends on `three.Color`. Phase 1 should have its own lite copy that doesn't depend on three. Phase 2 can collapse them into a shared util in `src/math/` or similar that returns a `Vec3` of linear RGB.
- **Test infrastructure.** The existing tests don't render anything — they verify parse math. Visual parity for skybox flavors will need either a manual side-by-side harness in `example/` (recommended — a single HTML page that mounts both backends in split-screen) or a screenshot-diff approach (overkill for this scope).

---

## Reference materials

In this folder:

- `webgl-renderer-research.md` — Full research report; required reading.
- `implementation-handoff.md` — This document.

Sibling folder:

- `../firefox-panel-rendering/rendering-issue-handoff.md` and `firefox-windows-scaling-rendering-postmortem.md` — Historical CSS3D rendering issue. Useful only if WebGL canvas layering produces new oddities.

Source files to study before starting Phase 1:

- `src/skybox/skybox-host.ts` — Lifecycle and rAF loop pattern to mirror in `LiteSkyboxHost`.
- `src/skybox/gradient-mesh.ts` and `src/skybox/starfield-skybox.ts` — Behavior to match in the lite versions. The GLSL shaders in these files are also exported (`GRADIENT_VERTEX_SHADER`, `STARFIELD_VERTEX_SHADER`, etc.) and can be adapted with minimal changes for the lite path.
- `src/skybox/css-color.ts` — CSS-variable color reading. Either fork or refactor for the lite path.
- `src/index.ts` — See how the legacy skybox factories are re-exported; mirror the structure for `src/skybox/lite/index.ts`.

External references for Phase 1:

- MDN: WebGL2 context creation, `gl.VERTEX_SHADER` / `gl.FRAGMENT_SHADER` compile cycle, `gl.POINTS` drawing, `gl_VertexID`, cube vs panorama not needed for Phase 1.
- The research doc's citation list has the specific MDN and spec links for each WebGL feature used.

---

## Starting checklist for the implementer

1. Read `webgl-renderer-research.md` end-to-end.
2. Skim this handoff in full, paying attention to the API contracts and the per-flavor notes.
3. Read `src/skybox/skybox-host.ts`, `src/skybox/gradient-mesh.ts`, `src/skybox/starfield-skybox.ts` to absorb the current behavior.
4. Stand up `src/skybox/lite/lite-skybox-host.ts` with no skyboxes plugged in — just verify a black canvas appears, sized correctly, with a `gl.clearColor`-driven background, surviving resize and visibility changes.
5. Set up a local verification harness: extend `example/main.ts` (or add a new example HTML page) to mount the three-backed `createStarfieldSkybox` and the lite `createStarfieldSkybox` side-by-side. Same camera, same options. This is the visual-parity rig for every subsequent flavor.
6. Implement `gradient-pass.ts` and `createGradientSkybox` next; verify against the three-backed version side-by-side.
7. Implement `starfield-pass.ts` and `createStarfieldSkybox`; verify visual parity including twinkle animation and CSS-var color refresh.
8. Wire up the subpath export, build, and measure bundle size against the Phase 1 acceptance number.
9. Optional but recommended: commit a small `scripts/measure-bundles.mjs` that builds the navigator-only and navigator+lite-starfield entries with `--minify` to a temp directory and prints sizes. Makes verifying acceptance criterion #4 in both phases a one-liner instead of an ad-hoc rebuild.
10. Hand off (or self-continue) to Phase 2 once Phase 1 acceptance is green.
