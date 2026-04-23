# @scupit/web-3d-panel-navigation

> **NOTE: This is vibe coded software!** I made this for personal
> use in my website; Use at your own discretion!

Standalone package for the fifth-attempt fullscreen pane navigation system. It preserves the current viewport-owned model: CSS3D planes defined by HTML data attributes, adaptive camera transitions, and clip-path based content reveal.

## Install

```bash
npm install @scupit/web-3d-panel-navigation three
```

## Usage

```ts
import { ZoomPlaneNavigator } from '@scupit/web-3d-panel-navigation';
import '@scupit/web-3d-panel-navigation/styles.css';

const navigation = new ZoomPlaneNavigator({
  sceneContainer: document.getElementById('scene-container')!,
  contentContainer: document.getElementById('page-content-container')!,
  planesSource: document.getElementById('zoom-planes-source')!,
  backButton: document.getElementById('back-button'),
});
```

Plane elements must live inside `#zoom-planes-source` and use the existing `data-zoom-plane`, `data-section`, `data-width`, `data-height`, `data-position`, and `data-rotation` attributes. Content sections must be `.page-section` elements with IDs matching `data-section`.

## Public API

- `ZoomPlaneNavigator`
- `SceneGraph`
- `DEFAULT_CONFIG`
- `ContainerRefs`
- `NavigationConfig`
- `NavigationState`
- `NavigationEventType`
- `ZoomPlaneConfig`
- `ScreenRect`
- `CameraState`

## URL synchronization

By default the navigator mirrors the active panel into the URL fragment so reloads preserve state and links can be shared. The fragment value is the panel's `data-section` ID:

- Click a panel → URL becomes `…/#quick-links`
- Reload → page snaps directly into that section (no animation on cold load)
- Browser back/forward → triggers the normal zoom-out / zoom-in animations
- Returning to overview → URL fragment is cleared

The same fragments still work as plain anchor links in any future non-3D fallback rendering, since the browser will natively scroll to `<section id="quick-links">` with no JS at all.

Disable with `syncUrlHash: false`:

```ts
new ZoomPlaneNavigator(refs, { syncUrlHash: false });
```

Detailed design and architecture notes live in `docs/fifth-reference-attempt.md`.

## Skybox (optional)

The package also ships an optional WebGL skybox layer that sits behind the CSS3D panels and shares the navigator's camera, so rotating into a panel sweeps a real 3D backdrop. It's fully independent — tree-shaken out if you don't import it.

```ts
import {
  ZoomPlaneNavigator,
  SkyboxHost,
  createStarfieldSkybox,
} from '@scupit/web-3d-panel-navigation';

const nav = new ZoomPlaneNavigator({ /* ... */ });

const skyboxHost = new SkyboxHost({
  camera: nav.getScene().camera,
  mount: document.body,
  skybox: createStarfieldSkybox(),
});
skyboxHost.start();
```

`SkyboxHost` owns a `WebGLRenderer`, mounts a `<canvas id="skybox-canvas">` with inline fixed-viewport styles, runs its own rAF loop, auto-pauses on `document.hidden`, and routes `attach/detach/refresh` lifecycle calls to the active `Skybox`. Options:

- `camera` — shared `PerspectiveCamera` (usually `nav.getScene().camera`)
- `mount` — element the canvas is appended to
- `skybox` — the active provider
- `clearColor` — fallback color painted before the provider renders; defaults to `0x000000`
- `canvasId` — override the canvas ID (default `"skybox-canvas"`)
- `canvasStyle` — `Partial<CSSStyleDeclaration>` merged on top of the inline defaults

### Built-in providers

- **`createGradientSkybox(options?)`** — procedural three-stop gradient along a direction vector. Reads colors from CSS variables `--skybox-color-a|b|c` by default (fallback hexes provided). Cheap and asset-free.
- **`createStarfieldSkybox(options?)`** — gradient base + `THREE.Points` starfield with per-star color/size/phase attributes and a twinkle shader. Reads `--skybox-star-color` and `--skybox-star-color-cool`.
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

### Building blocks for custom providers

Custom `Skybox` implementations conform to:

```ts
interface Skybox {
  root: THREE.Object3D;
  ready?: Promise<void>;
  attach?(scene: THREE.Scene): void;
  detach?(scene: THREE.Scene): void;
  update?(dt: number, camera: THREE.PerspectiveCamera): void;
  refresh?(): void;
  dispose(): void;
}
```

Reusable helpers are exported alongside the providers:

- `createGradientMesh(options?)` — the inward-facing cube + gradient `ShaderMaterial` used by gradient/starfield.
- `readCssColor(name, fallback)` — `THREE.Color` from a CSS variable with a hex fallback.
- `GRADIENT_VERTEX_SHADER`, `GRADIENT_FRAGMENT_SHADER`, `STARFIELD_VERTEX_SHADER`, `STARFIELD_FRAGMENT_SHADER` — shader source constants, so you can fork the built-in shaders into your own materials.

## Local scripts

```bash
npm test
npm run build
npm run example:build
```
