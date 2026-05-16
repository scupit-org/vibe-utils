# @scupit/web-3d-panel-navigation

> **NOTE: This is vibe coded software!** I made this for personal
> use in my website; Use at your own discretion!

> **Heads up on browser device emulation:** The zoom-in framing can look
> wrong (panel positioned/sized oddly, especially in a simulated phone)
> inside a browser's responsive design / device toolbar mode — most
> noticeably in Firefox's responsive preview. The same build behaves
> correctly on real phone hardware. This appears to be a quirk in how
> the responsive preview reports viewport dimensions, not a bug in the
> framing math. If you're debugging zoom behavior, verify on a real
> device before chasing it as a code issue.

Standalone package for the fifth-attempt fullscreen pane navigation system. It preserves the current viewport-owned model: CSS3D planes defined by HTML data attributes, adaptive camera transitions, and clip-path based content reveal.

## Install

```bash
npm install @scupit/web-3d-panel-navigation
# Optional: only required if you import the three-backend
npm install three
```

## Picking a backend

The library ships two render backends, each at its own subpath import. Pick one based on your bundle-size / feature trade-off:

| Backend | Import path | Skybox flavors |
| --- | --- | --- |
| **Lite** | `@scupit/web-3d-panel-navigation/lite-backend` | gradient, starfield (custom WebGL2) |
| **Three** | `@scupit/web-3d-panel-navigation/three-backend` | gradient, starfield, cubemap, panorama (full three.js) |

The two backends are mutually exclusive in a single navigator. Importing only the backend you need keeps the unused one out of your bundle.

### Bundle sizes

Measured by `scripts/measure-bundles.mjs` (esbuild, minified, ESM, browser target) on a closed consumer bundle — i.e. including the relevant slice of `three` for the three-backend rows. The three rows that include `ZoomPlaneNavigator` are the realistic common-case numbers; the "Skybox only" rows are for callers using `LiteSkyboxHost` / `SkyboxHost` directly without the navigator.

| Configuration                  | Lite      | Three     |
| ------------------------------ | --------- | --------- |
| Navigator only (no skybox)     | ~51 KB    | ~524 KB   |
| Navigator + gradient skybox    | ~56 KB    | ~525 KB   |
| Navigator + starfield skybox   | ~60 KB    | ~530 KB   |
| Skybox only (no navigator)     | ~10–14 KB | ~490–495 KB |

Most three-backend cost is three.js itself, so adding skyboxes to a three navigator is nearly free; on lite, each skybox provider adds a few KB of WebGL2 shader/host code.

## Usage

```ts
import { ZoomPlaneNavigator, resolveContainerRefs } from '@scupit/web-3d-panel-navigation';
import { liteBackend } from '@scupit/web-3d-panel-navigation/lite-backend';
import '@scupit/web-3d-panel-navigation/styles.css';

const navigation = new ZoomPlaneNavigator(resolveContainerRefs(), liteBackend);
```

Swap `liteBackend` for `threeBackend` (imported from `/three-backend`) to use the three.js path instead. Everything else stays identical.

The host page **must** include elements with the IDs `scene-container`, `page-content-container`, `zoom-planes-source`, and (optional) `back-button`. Both `resolveContainerRefs()` and the bundled stylesheet rely on these names — they are part of the package contract, not configurable. Advanced consumers that need to construct a `ContainerRefs` manually (e.g. for testing) can still pass one directly to `ZoomPlaneNavigator`.

Plane elements must live inside `#zoom-planes-source` and use `data-zoom-plane`, `data-section`, `data-width`, and `data-height`. Positioning can be explicit with `data-position` and `data-rotation`, or tiled from another plane with one `data-tile-from-*` attribute plus `data-tile-angle`. Content sections must be `.page-section` elements with IDs matching `data-section`.

```html
<div class="zoom-plane"
     data-zoom-plane="center"
     data-section="about"
     data-width="1600"
     data-height="900"
     data-position="0, 0, 0"
     data-rotation="0, 0, 0"
     data-zoom-center>
  <span class="plane-label">About</span>
</div>

<div class="zoom-plane"
     data-zoom-plane="right"
     data-section="contact"
     data-width="1280"
     data-height="720"
     data-tile-from-right="center"
     data-tile-angle="30"
     data-tile-gap="45"
     data-tile-align="top"
     data-tile-rotation-offset="0, 2, -1">
  <span class="plane-label">Contact</span>
</div>
```

Tiled planes attach one edge to a reference plane edge. Positive `data-tile-angle` folds the tiled plane inward toward the reference plane's front side. Use `data-tile-gap` and `data-tile-align` for common monitor-like layouts. Optional `data-tile-offset="x, y"` is a lower-level additive hinge offset in the reference plane's local right/up axes, and optional `data-tile-rotation-offset="x, y, z"` applies extra reference-relative Euler rotation in degrees.

Tiled defaults are `data-tile-gap="0"`, `data-tile-align="center"`, `data-tile-align-offset="0"`, `data-tile-offset="0, 0"`, and `data-tile-rotation-offset="0, 0, 0"`. The final hinge offset is computed from gap/alignment first, then `data-tile-align-offset`, then the manual `data-tile-offset`.

## Public API

Main entry (`@scupit/web-3d-panel-navigation`):
- `ZoomPlaneNavigator`
- `SceneGraph`
- `DEFAULT_CONFIG`
- `resolveContainerRefs()`
- `REQUIRED_CONTAINER_IDS`
- `ContainerRefs`
- `NavigationConfig`
- `NavigationState`
- `NavigationEventType`
- `ZoomPlaneConfig`
- `ScreenRect`
- `CameraState`
- Backend contract types: `RenderBackend`, `RenderTypes`, `Vec3Like`, `EulerLike`, `QuaternionLike`, `Matrix4Like`, `Object3DLike`, `SceneLike`, `PerspectiveCameraLike`, `CSS3DObjectLike`, `CSS3DRendererLike`, `SkyboxHostLike`

Lite backend (`@scupit/web-3d-panel-navigation/lite-backend`):
- `liteBackend` — the `RenderBackend<LiteRenderTypes>` value passed into `ZoomPlaneNavigator`
- `LiteSkyboxHost`, `LiteSkybox`, `LiteSkyboxHostOptions`, `SkyboxFrame`
- `createGradientSkybox`, `createStarfieldSkybox`, `GradientSkyboxOptions`, `StarfieldSkyboxOptions`
- Concrete classes: `Vector3`, `Euler`, `Quaternion`, `Matrix4`, `Object3D`, `Scene`, `PerspectiveCamera`, `CSS3DObject`
- `readCssColor`, `parseColorToLinear`

Three backend (`@scupit/web-3d-panel-navigation/three-backend`):
- `threeBackend` — the `RenderBackend<ThreeRenderTypes>` value passed into `ZoomPlaneNavigator`
- `SkyboxHost`, `Skybox`, `SkyboxHostOptions`, `SkyboxFactory`
- `createGradientSkybox`, `createStarfieldSkybox`, `createImageSkybox`, `createPanoramaSkybox`
- `CSS3DObject` (three-backed)
- `readCssColor`, `createGradientMesh`, plus the shader source constants

## URL synchronization

By default the navigator mirrors the active panel into the URL fragment so reloads preserve state and links can be shared. The fragment value is the panel's `data-section` ID:

- Click a panel → URL becomes `…/#quick-links`
- Reload → page snaps directly into that section (no animation on cold load)
- Browser back/forward → triggers the normal zoom-out / zoom-in animations
- Returning to overview → URL fragment is cleared

The same fragments still work as plain anchor links in any future non-3D fallback rendering, since the browser will natively scroll to `<section id="quick-links">` with no JS at all.

Disable with `syncUrlHash: false`:

```ts
new ZoomPlaneNavigator(refs, liteBackend, { syncUrlHash: false });
```

Detailed design and architecture notes live in `docs/fifth-reference-attempt.md`.

## Skybox (optional)

Each backend exposes a skybox host that sits behind the CSS3D panels and shares the navigator's camera, so rotating into a panel sweeps a real 3D backdrop. Skybox hosts are constructed via the backend's `createSkyboxHost(...)` factory:

```ts
import { ZoomPlaneNavigator, resolveContainerRefs } from '@scupit/web-3d-panel-navigation';
import { liteBackend, createStarfieldSkybox } from '@scupit/web-3d-panel-navigation/lite-backend';

const nav = new ZoomPlaneNavigator(resolveContainerRefs(), liteBackend);

const skyboxHost = liteBackend.createSkyboxHost({
  camera: nav.getScene().camera,
  mount: document.body,
  skybox: createStarfieldSkybox(),
});
skyboxHost.start();
```

Substitute `threeBackend` and `import { threeBackend, createStarfieldSkybox } from '@scupit/web-3d-panel-navigation/three-backend'` to get the three-based path with the same one-camera shape — no manual sync.

Hosts mount a `<canvas id="skybox-canvas">` with inline fixed-viewport styles, run their own rAF loop, auto-pause on `document.hidden`, and (lite-only) handle WebGL context loss/restore. Options:

- `camera` — the navigator's camera (`nav.getScene().camera`)
- `mount` — element the canvas is appended to
- `skybox` — the active provider for the active backend
- `clearColor` — fallback color painted before the provider renders; defaults to black
- `canvasId` — override the canvas ID (default `"skybox-canvas"`)
- `canvasStyle` — `Partial<CSSStyleDeclaration>` merged on top of the inline defaults

### Built-in providers

Lite backend:
- **`createGradientSkybox(options?)`** — procedural three-stop gradient as a fullscreen pass. Reads CSS variables `--skybox-color-a|b|c` (fallbacks provided).
- **`createStarfieldSkybox(options?)`** — gradient base + raw-WebGL2 points starfield with twinkle. Reads `--skybox-star-color` and `--skybox-star-color-cool`.

Three backend:
- All of the above (via three's `ShaderMaterial`), plus:
- **`createImageSkybox({ cubeUrls })`** — six-image cubemap assigned to `scene.background`.
- **`createPanoramaSkybox({ url })`** — equirectangular panorama; applies `EquirectangularReflectionMapping` + `SRGBColorSpace`.

### CSS variable conventions

Providers that need colors read these names off `document.documentElement` at construction time (and on `refresh()`). Declare them in your stylesheet to theme the skybox:

| Variable | Default fallback | Used by |
| --- | --- | --- |
| `--skybox-color-a` | `#2a1a10` | gradient, starfield |
| `--skybox-color-b` | `#3d2414` | gradient, starfield |
| `--skybox-color-c` | `#5c3420` | gradient, starfield |
| `--skybox-star-color` | `#ffe6c8` | starfield (warm end) |
| `--skybox-star-color-cool` | `#b5c9ff` | starfield (cool end) |

Call `skyboxHost.refresh()` after mutating these at runtime.

## Local scripts

```bash
npm test
npm run build
npm run example:build
```
