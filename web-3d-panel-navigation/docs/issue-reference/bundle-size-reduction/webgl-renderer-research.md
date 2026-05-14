# Minimal custom WebGL skybox renderer for @scupit/web-3d-panel-navigation

## Executive summary

- A skybox-specific renderer does **not** need a scene graph. WebGL fundamentally needs shader programs, buffers/textures, uniforms, and draw calls; in this use case the runtime can be a fixed pass list — one fullscreen background pass plus an optional `gl.POINTS` star pass — with no `Object3D` hierarchy, no world-matrix propagation, and no traversal. WebGL2 even allows a fullscreen triangle with no vertex buffer at all via `gl_VertexID`, because the vertex shader only has to produce clip-space positions. citeturn20view0turn20view1turn22search10

- **WebGL2** is the right target. Current support is broad at roughly 95% global usage, with support in Chrome 56+, Firefox 51+, and Safari 15+; by contrast, WebGPU is still disabled by default in Firefox stable and only partial in Safari desktop support tables, so it is not the smaller or safer implementation for an evergreen “current + one behind” browser target. citeturn7view0turn7view1turn6view0

- **Raw WebGL2** is the right default, not regl/twgl. `regl` is valuable when many dynamic draw commands and state transitions need taming, and TWGL is explicitly a thin helper to reduce WebGL verbosity, but this renderer only needs a handful of programs, one particle buffer, and simple texture upload helpers. That keeps the byte budget lower with raw WebGL; if implementation speed matters more than every kilobyte, TWGL is the only helper worth considering. citeturn13search1turn31view2

- A realistic custom implementation is on the order of **11–18 KB minified** for plumbing plus all four shipped flavors, or about **8.5–13.5 KB minified** for gradient + starfield + panorama. Those are engineering estimates, but they are consistent with the extremely small API surface actually required compared with a general-purpose renderer. Using import-time subpath exports to keep a separate three-backed escape hatch gives the smallest default bundle without losing the advanced fallback path.

## Recommended architecture

The right mental model is not “mini three.js.” It is “one background renderer with a tiny pass registry.” For this package, a lite backend only needs something like `init(gl)`, `render(frame)`, `refresh?()`, and `dispose()`. The frame payload should carry camera orientation and viewport data, not scene objects: CSS pixel size, backing-buffer size, `fovY`, `aspect`, current time / delta time, and either a rotation-only view matrix or the camera basis vectors. That is enough for all four skyboxes. The only pass that truly benefits from continuous animation is the starfield; gradient, cubemap, and panorama can be redrawn only when the camera changes, the viewport changes, or the source colors/textures change. This is an architectural inference from the WebGL pipeline and from the fixed, shader-driven nature of the four current skybox flavors. WebGL itself is just a canvas-backed rendering context that executes JavaScript control code plus GLSL shaders, and the core data path is model/view/projection math into clip space. citeturn20view0turn20view1

The minimum camera math can be even smaller than a conventional renderer. For the three fullscreen background flavors — gradient, cubemap, panorama — there is no need to build a scene matrix, no need to propagate transforms, and no need to update skybox position. The classic skybox trick is to remove camera translation from the view transform so the background rotates with the camera but never translates. In practice, the cheapest version is to skip a full inverse view-projection and pass camera basis vectors directly: `forward = normalize(target - position)`, `right = normalize(cross(forward, up))`, and `up' = cross(right, forward)`, plus `tan(fovY/2)` and aspect. The fragment shader reconstructs a world ray from `gl_FragCoord`, normalizes it, and shades/samples from that. `gl_FragCoord` is window-relative in the fragment stage, and WebGL’s view/projection model is the standard one described in the platform docs. citeturn29search1turn20view1

For the starfield, rotation-only camera math is still the right default. A single point cloud centered at the origin, transformed by a projection matrix and a **translation-free** view rotation, will behave like an infinite backdrop and spare the host from explicit sky-object position updates. The only conventional 4×4 matrix that still matters is the perspective projection; the view translation can be zeroed, or the vertex shader can derive view-space coordinates from the camera basis directly. Either way, the scene-graph value proposition is essentially zero for this use case. citeturn20view1

## Per-flavor implementation sketches

### Gradient skybox

Use a single fullscreen triangle. In WebGL2, the vertex shader can synthesize three clip-space vertices from `gl_VertexID`; in a conservative WebGL1 path, the fallback is a one-time 3-vertex static buffer. The fragment shader reconstructs a normalized view/world direction from the camera basis or inverse projection data, then mixes the three gradient colors by direction. There is no skybox cube, no `BoxGeometry`, and no per-frame vertex work beyond emitting the fullscreen primitive. WebGL2’s built-in `gl_VertexID` is what makes the zero-buffer fullscreen path possible. citeturn22search10turn20view1

The one subtle fidelity issue is color handling. In three.js, `Color` stores values in a linear working space, and CSS strings / hex inputs are interpreted as sRGB and converted to linear automatically. If the current gradient colors are coming from CSS variables and are currently parsed through three `Color`, then a raw-WebGL port should linearize them before interpolation if matching today’s look matters closely; otherwise the gradient blend can shift slightly because interpolation will happen in the wrong space. citeturn30view0

### Starfield skybox

This is one `gl.POINTS` draw over the gradient pass. A single typed-array buffer contains per-star attributes: position, phase, brightness, and tint. The vertex shader applies projection plus **rotation-only** view, sets `gl_PointSize`, and passes twinkle inputs to the fragment shader. The fragment shader uses `gl_PointCoord` to shape each point into a round or soft-edged sprite, modulates intensity with `uTime`, and outputs a color suitable for additive blending. WebGL’s built-ins and fixed-function state already cover everything this needs: `drawArrays(gl.POINTS, ...)`, `gl_PointSize`, `gl_PointCoord`, `blendEquation`, and `blendFunc`. citeturn23search0turn24search0turn24search1turn11view0turn11view1

If the goal is “render identically” rather than merely “render similarly,” the blend factors should match whatever the current three material is effectively using, but nothing more sophisticated than ordinary additive blending state is required. The starfield does not need an index buffer, scene nodes, or CPU-side per-frame transforms; the only time-varying uniform is the animation clock. citeturn11view0turn11view1

### Cubemap skybox

Again, use the same fullscreen-triangle background path as the gradient. The only difference is the fragment shader samples a `samplerCube` with the reconstructed ray direction instead of computing color procedurally. Texture upload is straightforward: create one cube-map texture and issue six `texImage2D` calls, one for each `TEXTURE_CUBE_MAP_*` face target. The face images must be square and all faces must share a size; cubemap lookup uses a 3D direction vector rather than 2D UVs. citeturn25view0turn18view0

This is materially simpler in WebGL2 than WebGL1 because non-power-of-two textures have no special restrictions in WebGL2, including mipmapping and wrapping. In WebGL1, NPOT restrictions and extension handling make the texture path messier. One open visual risk remains: standard cubemap filtering does not normally interpolate across face boundaries, so seam-free output still depends on the six source images being authored consistently. citeturn33search14turn18view0

### Panorama skybox

Panorama is the same fullscreen background program shape as cubemap, but with a `sampler2D` and fragment-side equirectangular sampling math. The fragment shader converts the reconstructed direction to spherical UV coordinates, then samples the panorama texture. Texture upload is a single `TEXTURE_2D` path. `texImage2D` accepts `HTMLImageElement` sources directly, and `UNPACK_FLIP_Y_WEBGL` is available if source orientation needs correction on upload. citeturn4view4turn11view2

For color fidelity, the raw-WebGL path should mimic the current three behavior for LDR color textures. Three’s texture docs state that textures containing color data should be annotated with `SRGBColorSpace` or `LinearSRGBColorSpace`, and your current three-backed panorama already uses sRGB semantics. In WebGL2, the clean path is an sRGB internal format such as `SRGB8_ALPHA8`; in WebGL1, `EXT_sRGB` provides sRGB texture support. A compatibility-first fallback is to upload as standard `RGBA` / `UNSIGNED_BYTE` and decode to linear in shader if sRGB texture formats are unavailable or intentionally avoided. citeturn30view1turn11view4turn4view4

### Rough implementation size by flavor

| Flavor | Draws per frame | Rough line count | Rough minified bytes | Notes |
|---|---:|---:|---:|---|
| Gradient | 1 | 80–120 | 1.0–1.8 KB | Fullscreen triangle, no geometry object model |
| Starfield incremental cost | 1 extra | 170–240 | 2.5–4.0 KB | One VBO/VAO, one shader pair, one blend state |
| Cubemap | 1 | 110–170 | 1.8–3.0 KB | Six-image upload helper dominates |
| Panorama | 1 | 90–140 | 1.5–2.5 KB | One-image upload helper, equirectangular fragment math |

## Minimal plumbing layer and total byte budget

A minimal shared WebGL2 layer only needs five clusters of code: context creation, shader/program helpers, one attribute/buffer helper for the starfield, one texture upload helper covering `TEXTURE_2D` and `TEXTURE_CUBE_MAP`, and one resize/render scheduler. In plain API terms, the common surface is roughly: `getContext("webgl2")`, shader compile/link, `createBuffer` / `bufferData` / `vertexAttribPointer`, optional VAOs via `createVertexArray`, `uniform*`, `drawArrays`, `createTexture` / `texImage2D` / `texParameteri` / `generateMipmap`, `pixelStorei`, `viewport`, and for the star pass, blend enable + factors/equation. That is far smaller than a general renderer because there are no materials, no state sorting, no geometry abstractions, no framebuffers, no shadowing, and no mesh traversal. citeturn6view0turn4view5turn12search1turn12search3turn25view0turn11view2turn11view3

Resize handling should follow the browser’s two-size model for canvas: CSS display size and drawing-buffer size are distinct. After updating the backing size, the host must call `gl.viewport(0, 0, canvas.width, canvas.height)`. It is also worth checking the actual drawing-buffer dimensions because implementations are allowed to give a buffer smaller than the requested size. That makes DPR clamping the right policy for a decorative sky layer. citeturn27search1turn27search0

For texture uploads, prefer `RGBA`-family paths over `RGB`-only paths. MDN’s WebGL best-practices note that some RGB formats are emulated and can be surprisingly slow; RGBA8-style handling is often the safer default. Likewise, if WebGL2 is the target, NPOT concerns largely disappear; if a WebGL1 fallback is ever added, NPOT panoramas and cubemaps must disable mipmaps and use `CLAMP_TO_EDGE` plus `LINEAR` filtering. citeturn4view2turn21view0turn33search14

The realistic shared-plumbing estimate is **180–260 lines** and about **4–6 KB minified**. Adding the four flavors yields a full renderer in the **510–760 line / 11–18 KB minified** range. If cubemap is omitted, the likely range drops to roughly **390–570 lines / 8.5–13.5 KB minified**. These are engineering estimates, but they are the right order of magnitude for raw WebGL2 with no helper dependency and with shader strings included.

The helper-library answer is therefore simple: raw WebGL2 should be the default. TWGL explicitly exists to reduce verbosity and not to be a 3D engine, which makes it conceptually closer to your need than `regl`; however, TWGL still adds generic helpers for programs, buffers, textures, and optional math/primitives that this renderer barely needs. `regl` is better suited to projects with many commands and frequent state changes. For this package’s “four shaders, one particle buffer, decorative-only” scope, raw code should beat both on shipped bytes and on conceptual fit. citeturn31view2turn13search1

## CSS3D coexistence checklist

- **Make the WebGL canvas a sibling of the CSS3D root, not a child of a transformed container.** Fixed-position elements are normally pinned to the viewport, but any ancestor with `transform`, `filter`, `perspective`, related properties, or some containment/will-change combinations can become the containing block for absolutely or fixed-positioned descendants. For a fullscreen skybox behind CSS3D content, the safest pattern is a root-level or sibling canvas with `position: fixed; inset: 0; z-index: 0; pointer-events: none`, and a separate CSS3D root above it with a higher `z-index`. citeturn26view0turn26view1

- **DOM-over-WebGL compositing is a normal pattern.** MDN explicitly notes that WebGL elements can be mixed with other HTML elements and composited with the page. The bigger practical gotcha is not “mandatory readback on every CSS3D recomposition,” but canvas/compositor configuration: MDN’s WebGL best practices warn that `alpha: false` can be expensive on some platforms. For this use case, the safest default is usually `alpha: true`, `premultipliedAlpha: true`, and writing alpha `1.0` from the shaders, unless measurement on your supported devices proves otherwise. citeturn20view0turn4view2turn6view0

- **Clamp DPR and update the viewport on every size change.** When the canvas backing size changes, `gl.viewport` must be updated as well. If the implementation cannot provide the requested dimensions, `drawingBufferWidth` / `drawingBufferHeight` may differ from the requested canvas size; use that actual size for resolution uniforms. citeturn27search1turn27search0

- **Static skies do not need a permanent RAF.** Gradient, cubemap, and panorama can redraw on camera change, resize, and asset/theme refresh. The starfield needs animation; for that path, `requestAnimationFrame` already pauses in most background tabs, but it is still worth handling `visibilitychange` so resumed frames do not consume a giant accumulated `dt`. citeturn9search1turn9search2

- **Handle context loss explicitly.** Listen for `webglcontextlost` and `webglcontextrestored`. Once restored, previous textures, buffers, and programs are no longer valid and must be recreated. That is especially relevant on memory-constrained mobile devices and for an app expected to survive long-lived tab sessions. citeturn6view1turn6view3

- **Texture loading without three loaders is minimal but not optional work.** Cross-origin images need a `crossorigin` setting on the image element plus a permissive server CORS header; local `file:///` URLs are not a valid test path for WebGL textures. `texImage2D` accepts `HTMLImageElement` directly. For upload correctness, `UNPACK_FLIP_Y_WEBGL` is the main knob to set explicitly when needed. citeturn4view7turn4view6turn4view4turn11view2

## Backend split and API recommendation

The cleanest public packaging is to ship **both backends via subpath exports**, with “lite” as the intended default for bundle-sensitive consumers and “three” as the explicit escape hatch. In other words:

```ts
@scupit/web-3d-panel-navigation/skybox-lite
@scupit/web-3d-panel-navigation/skybox-three
```

That keeps import-time backend choice explicit and prevents bundlers from dragging both implementations into the same consumer bundle. A runtime backend flag is the wrong tradeoff here because it risks keeping both codepaths alive in production bundles.

The current `Skybox` interface is too three-shaped for the lite backend. A field like `root: Object3D` encodes a scene-graph requirement that the custom renderer does not have. The cleanest split is to preserve the current interface under the three backend and introduce a backend-native lite interface based on lifecycle plus a camera/frame payload. The public ergonomics should stay consistent at the factory level — `createGradientSkybox`, `createStarfieldSkybox`, and so on — but the backend-specific host contract should diverge where it needs to.

A minimal lite contract should look conceptually like this:

```ts
interface LiteSkybox {
  init(gl: WebGL2RenderingContext): void;
  render(frame: SkyboxFrame): void;
  refresh?(): void;
  dispose(): void;
}

interface SkyboxFrame {
  widthCss: number;
  heightCss: number;
  widthPx: number;
  heightPx: number;
  fovY: number;
  aspect: number;
  time: number;
  dt: number;
  forward: Float32Array;
  right: Float32Array;
  up: Float32Array;
}
```

That interface keeps camera ownership where it already belongs — the navigator — and hands the skybox a read-only snapshot each frame or each invalidation. It also avoids forcing the lite path to emulate a fake scene or fake `Object3D` tree just to preserve API symmetry.

The tradeoff is straightforward. Shipping only the custom backend produces the smallest maintenance surface, but it removes a valuable escape hatch for advanced texture workflows and any consumer-extensible three-specific skybox code. Shipping both backends behind subpaths is a moderate maintenance burden, but it gives the smallest default bundle **and** preserves a fallback path for the cases where a tiny renderer should not grow into a full engine.

## Open risks and where a three fallback still earns its keep

- **HDR / RGBE / EXR panoramas remain the clearest reason to keep a three-backed path.** Your stated scope already excludes them, and that is the correct line. Once tone mapping, HDR decode, PMREM generation, or environment-lighting semantics matter, the minimal renderer stops being minimal.

- **Exact color matching is a real but manageable risk.** Three treats CSS/hex colors as sRGB inputs and stores `Color` values in a linear working space; its texture docs likewise expect color textures to be annotated with `SRGBColorSpace` or `LinearSRGBColorSpace`. A lite renderer that skips those conversions can look slightly “off,” especially on the gradient path. citeturn30view0turn30view1

- **Cubemap seams depend on source assets.** Cubemap sampling uses directional lookup, but standard filtering does not normally blur across face boundaries. A minimal renderer can reproduce current behavior, but it cannot fix badly authored face edges by itself. citeturn18view0

- **Context-loss recovery must be treated as real work, not a corner case.** On restore, all pre-loss GPU resources are invalid. If the host is meant to be robust across mobile app-switching, long sessions, or low-memory conditions, the lite path needs a clean reinit story. citeturn6view1turn6view3

- **WebGL1 fallback support would raise complexity disproportionately.** The flavor set is all possible in WebGL1, but doing so reintroduces NPOT texture restrictions, extension negotiation for sRGB, older shader syntax, and a few extra plumbing branches. Given current browser support, that complexity is hard to justify for the default path. citeturn21view0turn11view4turn7view0

Overall recommendation: build a **raw WebGL2, pass-based `skybox-lite` backend**, keep **`skybox-three` as an opt-in escape hatch**, and do **not** carry a scene graph into the lite design. That is the strongest bundle-size win available while still preserving an answer for the advanced cases the tiny renderer should deliberately refuse to solve.