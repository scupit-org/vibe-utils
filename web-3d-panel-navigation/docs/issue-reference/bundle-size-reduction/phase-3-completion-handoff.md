# Phase 3 Completion Handoff — Pluggable `RenderBackend` Architecture

## Summary

Phase 2 left two parallel type systems coexisting: library-native primitives
that the navigator ran on, and three primitives reached only through the
legacy `src/skybox/` (the three-backed skybox host, an opt-in escape hatch).
Phase 3 replaces that coexistence with a unified backend-injection
architecture. The navigator now accepts a `RenderBackend<T>` at construction
time, both backends implement the same `RenderBackend` contract, and the
consumer picks one by import path.

The pre-Phase-2 camera ergonomics are restored — one camera object flows
through `ZoomPlaneNavigator` → `createSkyboxHost(...)` without a manual sync
step — at the cost of an additional required `backend` argument to the
navigator constructor. The Phase 2 bundle-size win is preserved on the lite
path because the unchosen backend is dropped at the module-graph level (each
backend lives at its own subpath export and the navigator core is
backend-agnostic).

## What changed

### New folders

| Path | Purpose |
| --- | --- |
| `src/render-contract/` | Backend-agnostic interfaces and the `RenderBackend<T>` factory contract. Zero runtime imports of three or of any backend-specific primitives. |
| `src/render/` | Shared CSS3DRenderer rewritten against `render-contract` interfaces. Identifies CSS3D-aware nodes by an `isCSS3DObject: true` tag rather than `instanceof`. Used by both backends. |
| `src/backends/lite/` | The lite backend: relocated `math/`, `scene/`, and the lite WebGL2 skybox host. Exports `liteBackend` plus concrete classes. |
| `src/backends/three/` | The three backend: a `CSS3DObject` subclass of `THREE.Object3D`, plus the relocated three-backed skybox flavors. Exports `threeBackend` plus skybox factories. |

### Removed folders / files

| Path | Disposition |
| --- | --- |
| `src/math/`, `src/scene/` | Moved under `src/backends/lite/`. |
| `src/skybox/` (legacy three) | Moved under `src/backends/three/skybox/`. |
| `src/skybox/lite/` | Moved under `src/backends/lite/skybox/`. |
| `src/css3d-renderer.ts` | Replaced by `src/render/css3d-renderer.ts` (backend-agnostic). |

### Constructor signature change (breaking)

```ts
// Before
new ZoomPlaneNavigator(refs, config?)

// After
new ZoomPlaneNavigator(refs, backend, config?)
```

The backend is a required second argument. `ZoomPlaneNavigator` itself is
now generic over `T extends RenderTypes`, and every downstream class /
function that used to depend on lite-specific primitives is generic over the
same `T` and takes a `backend: RenderBackend<T>` parameter:
`ZoomPlaneNavigator`, `SceneGraph`, `CameraController`,
`calculateOverviewState`, `parseAllZoomPlanes`, and the math helpers in
`projection.ts` and `camera-transitions.ts`. The `CameraState` and
`CSS3DObjectRef` types in `src/types.ts` are also generic over `T`.

### Subpath exports

| Subpath | Contents |
| --- | --- |
| `@scupit/web-3d-panel-navigation` | Navigator core + `render-contract` types only |
| `@scupit/web-3d-panel-navigation/render-contract` | Contract types only (no runtime) |
| `@scupit/web-3d-panel-navigation/lite-backend` | `liteBackend`, lite skybox factories, lite concrete classes |
| `@scupit/web-3d-panel-navigation/three-backend` | `threeBackend`, three skybox factories, three CSS3DObject |
| `@scupit/web-3d-panel-navigation/styles.css` | unchanged |

The old `./skybox-lite` subpath was renamed to `./lite-backend` — also a
breaking change, even though in practice the window of versions that
published `./skybox-lite` is small (Phase 2 only). No deprecated alias was
retained; any external consumer pinned to `@scupit/web-3d-panel-navigation/skybox-lite`
will need to update both the subpath and the consumer-side construction
shape together.

## Acceptance — final measurements

### Tests
- 86/86 passing. 78 pre-existing tests carried over with only import-path
  updates; 4 new backend-parity test cases were added in
  `src/backends/backend-parity.test.ts` and each runs against both backends
  (8 jest test runs total).
- `npm test`, `npm run build`, and `node ./scripts/measure-bundles.mjs` all green.

### Bundle sizes (minified, no `external`)

| Pair | Lite | Three | Delta | Ratio |
| --- | --- | --- | --- | --- |
| Nav + gradient | 55.9 KB | 525.3 KB | 469.4 KB | 9.4× |
| Nav + starfield | 60.2 KB | 529.8 KB | 469.6 KB | 8.8× |
| Gradient only | 10.1 KB | 490.4 KB | 480.3 KB | 48.7× |
| Starfield only | 14.3 KB | 494.8 KB | 480.5 KB | 34.5× |

### Three-leak guarantee

`rg "from 'three'" src/` returns matches only inside `src/backends/three/` and
two test files (`src/backends/lite/math/math.test.ts`,
`src/backends/lite/scene/scene.test.ts`) that cross-validate the lite
primitives against three. Tests are not part of the published bundle.

## Notable design decisions during implementation

### `Matrix4Like.elements` is `ArrayLike<number>`, not `Float32Array`

The contract initially used `Float32Array`. Three's `Matrix4.elements` is
actually a plain `Array<number>` at runtime, so the test failure caught a
contract-too-strict bug. Relaxing to `ArrayLike<number>` lets both backends
implement the same contract while the CSS3D renderer reads `elements[i]`
identically against either container type.

### `CSS3DRenderer` lives in `src/render/`, not in a backend

The plan suggested either keeping the renderer at the top level or moving it
to a `render/` folder. The latter was chosen because the renderer is genuinely
shared infrastructure consumed by both backends — neither backend owns it. It
imports only from `render-contract`, never from a backend.

### "Skybox only" consumers should import the host class, not the backend

The bundle-measurement tests for standalone-skybox use cases were updated to
import `LiteSkyboxHost` and `SkyboxHost` directly rather than the
`liteBackend` / `threeBackend` factory objects. Esbuild can't tree-shake
properties off a single object literal, so referencing `liteBackend` keeps
*every* navigator-side factory it aggregates reachable in the module graph:
`createCSS3DRenderer`, `createCSS3DObject`, `createScene`,
`createPerspectiveCamera`, `createObject3D`, plus the four math primitive
factories. In practice the measured savings from skipping the backend
object are ~15 KB minified (lite gradient drops from 25.1 KB → 10.1 KB; lite
starfield from 29.5 KB → 14.3 KB).

Consumers who don't need the navigator should import the host class
directly; the README and the measure-bundles script reflect this pattern.
This is a documentation/discoverability nuance rather than a defect, but
worth keeping in mind for future API documentation.

### `lite-compare.ts` still uses a cross-backend cast

The visual-parity harness at `example/lite-compare.ts` constructs a single
`THREE.PerspectiveCamera` and feeds it to both `threeBackend.createSkyboxHost`
and `liteBackend.createSkyboxHost`. The lite host's options type is pinned to
the lite `PerspectiveCamera`, so the test crosses backend universes with a
cast. This is intentional — the harness exists precisely to prove the two
backends render visually identical output from the same camera state — but
production consumers do not need (and should not write) such casts.

## Known issues / follow-ups

- None blocking. The Phase 2 acceptance criteria are all preserved, the
  Phase 3 ergonomics target is met (no manual two-camera sync in
  `example/three-skybox.ts`), and the bundle budgets all pass with headroom.
- Future work (unnumbered; all seven phases from the plan are complete) could
  split the backend factory object into per-primitive named exports — e.g.
  `liteCreateSkyboxHost`, `liteCreateCSS3DRenderer` — so that the
  navigator-less skybox use case can reach for `liteCreateSkyboxHost`
  without dragging the rest of the backend's factories in via the shared
  object literal. The current workaround — importing `LiteSkyboxHost`
  directly — is sufficient for now and documented in the README.

## Reference

- Phase 3 plan: `c:\Users\skyla\.cursor\plans\phase_3_render_backend_23a08229.plan.md`
- Original Phase 1/2 handoff (anticipated Phase 3): `implementation-handoff.md`
  in this folder
- Phase 2 completion handoff: `phase-2-completion-handoff.md` in this folder
- Earlier visual-bug postmortems: `lite-skybox-canvas-scaling-postmortem.md`,
  `lite-skybox-starfield-blend-func-postmortem.md`
