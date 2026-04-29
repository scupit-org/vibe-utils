# Firefox / Windows Display Scaling Panel Rendering Issue Handoff

> Historical note: this handoff captures the investigation state before the
> final workaround was identified. For the resolved cause, final verification,
> and retained code change, read
> `firefox-windows-scaling-rendering-postmortem.md` in this directory.

## Summary

`sky-site` has a Firefox-only initial rendering issue in the homepage 3D panel navigation. On some smaller Windows displays using non-100% display scaling, some CSS3D panels render incompletely on page load, with a section visibly cut off. The issue does not appear to be caused by the library's camera/framing math. Current evidence points toward a Firefox/WebRender rasterization, visible-rect, or clipping bug triggered by Windows display scaling interacting with CSS3D-transformed DOM.

The problem occurs in the homepage panels declared in:

- `sky-site/src/index.html`
- `sky-site/src/_includes/ZoomPlane.11ty.tsx`

Those panels are rendered through the local/package library:

- `vibe-utils/web-3d-panel-navigation/`
- installed in `sky-site/node_modules/@scupit/web-3d-panel-navigation/`

The local `vibe-utils` source and installed `node_modules` source matched for the rendering-critical files checked during investigation.

## Current User-Observed Behavior

- Browser: Firefox, latest as of April 29, 2026.
- OS/display context: Windows display scaling is involved.
- At 100% Windows display scaling on the 15-inch 1080p screen, the issue no longer occurs.
- At 125% Windows display scaling on the same screen, the issue occurs.
- At 150% Windows display scaling, the issue occurs more severely, with more content cut off.
- Firefox browser zoom stayed at 100% during these tests.
- A physically larger 23.5-inch screen at the same 1920x1080 physical resolution did not reproduce the problem.
- Initially, hovering any panel fixed the incomplete render. After removing the SVG `filter` from `.zp-frame`, hovering no longer fixes it. This strongly suggests the hover state had been forcing a useful re-rasterization/repaint, not fixing the root cause.

## Existing Change Made During Investigation

The SVG drop-shadow filter was disabled in:

- `sky-site/src/home/home.scss`

Specifically, the `.zp-frame` `filter: drop-shadow(...)` and `.zoom-plane:hover .zp-frame` filter rule were removed. This did not fix the initial clipping issue, but it changed the invalidation behavior: hovering a panel no longer repairs the render. That is useful evidence that the old hover filter change was triggering a repaint/raster invalidation.

## Relevant Site Files

### `sky-site/src/index.html`

Defines the homepage panel data in front matter and renders the panels:

- `about`: center panel, explicit position/rotation, `zoomCenter: true`
- `projects`: tiled from `about` right side
- `games`: tiled from `projects` bottom side
- `resume`: tiled from `about` left side
- `contact`: tiled from `about` top side

Important DOM containers:

- `#zoom-planes-source`
- `#scene-container`
- `#page-content-container`
- `#back-button`

### `sky-site/src/_includes/ZoomPlane.11ty.tsx`

Maps panel front matter into the library's expected data attributes:

- `data-zoom-plane`
- `data-section`
- `data-width`
- `data-height`
- explicit `data-position` / `data-rotation`
- tiled layout attributes such as `data-tile-from-right`, `data-tile-angle`, etc.

It also emits a full-panel SVG frame:

- `<svg className="zp-frame" viewBox="0 0 100 100" preserveAspectRatio="none">`
- several SVG paths/lines for the decorative panel frame
- `<span className="plane-label">`

### `sky-site/src/home/home.ts`

Initializes the navigation:

```ts
const navigator = new ZoomPlaneNavigator({
  sceneContainer,
  contentContainer,
  planesSource,
  backButton,
});

const skyboxHost = new SkyboxHost({
  camera: navigator.getScene().camera,
  mount: document.body,
  skybox: createStarfieldSkybox({ starCount: 10000 }),
  clearColor: 0x2a1a10,
});
skyboxHost.start();
```

The skybox is WebGL and sits behind the CSS3D scene. It has not yet been proven involved.

### `sky-site/src/home/home.scss`

Imports package CSS:

```scss
@use "../../node_modules/@scupit/web-3d-panel-navigation/dist/styles.css";
```

Then overrides panel visuals. Important current rules:

- `.zoom-plane` removes package border/background.
- `.zp-frame` is full-panel, absolutely positioned, `overflow: visible`, no filter after this investigation.
- SVG paths use `vector-effect: non-scaling-stroke`.
- `.plane-label` has text shadow and high letter spacing.

## Relevant Library Files

### Docs

- `vibe-utils/web-3d-panel-navigation/README.md`
- `vibe-utils/web-3d-panel-navigation/docs/fifth-reference-attempt.md`

These describe the package as a viewport-owned CSS3D panel navigation system using Three.js math and DOM/CSS3D rendering. They also note that browser responsive/device emulation can report viewport dimensions oddly and make zoom-in framing look wrong, especially in Firefox responsive preview.

### `vibe-utils/web-3d-panel-navigation/src/zoom-navigation.ts`

Main orchestrator:

- Parses panels with `parseAllZoomPlanes`.
- Creates `SceneGraph`.
- Calculates overview camera with `calculateOverviewState`.
- Creates `CameraController`.
- Starts a persistent `AnimationTimeline`.
- Subscribes `sceneGraph.render()` to every frame.
- Handles resize by calling `sceneGraph.setSize(width, height)` and recalculating overview state if in overview.

Important point: this is not a single-render setup. The CSS3D scene is rendered every rAF frame after initialization.

### `vibe-utils/web-3d-panel-navigation/src/scene-graph.ts`

Creates the Three.js scene/camera and CSS3D renderer. For each panel:

- sets element width/height from parsed config
- wraps the original DOM element in `CSS3DObject`
- applies position, rotation, and `object.scale.set(config.scale, config.scale, config.scale)`
- default `scale` is `0.5`

Potentially relevant: the library scales CSS3D objects via Three/CSS matrix scale rather than pre-scaling the panel dimensions/layout.

### `vibe-utils/web-3d-panel-navigation/src/css3d-renderer.ts`

Custom CSS3D renderer. Important implementation details:

- renderer root `domElement`:
  - `overflow = 'hidden'`
  - `perspectiveOrigin = '50% 50%'`
- `cameraElement`:
  - `transformStyle = 'preserve-3d'`
  - `pointerEvents = 'none'`
  - absolute positioned
- `setSize(width, height)` sets CSS pixel widths/heights from `window.innerWidth` / `window.innerHeight`.
- `render()` computes CSS perspective from the Three projection matrix and viewport half-height.
- camera transform is:

```ts
translateZ(${fov}px)
${cameraCSSMatrix}
translate(${this.widthHalf}px,${this.heightHalf}px)
```

- object transform is:

```ts
translate3d(-50%,-50%,0)
matrix3d(...)
```

Potentially relevant: renderer root clips overflow; Firefox may be calculating a bad visible/raster rect under non-integer Windows display scaling.

### `vibe-utils/web-3d-panel-navigation/src/styles.scss`

Structural CSS includes:

- `html, body { overflow: hidden; height: 100%; }`
- `#zoom-planes-source { position: absolute; visibility: hidden; pointer-events: none; }`
- `#scene-container { position: fixed; width: 100%; height: 100vh; z-index: 1; }`
- `#page-content-container { position: fixed; width: 100vw; height: 100vh; overflow: hidden; clip-path: inset(50% 50% 50% 50%); opacity: 0; }`

Initial issue is in the panel overview, so `#page-content-container` is probably not the first suspect, but `clip-path` and opacity are used during transitions.

### `vibe-utils/web-3d-panel-navigation/src/overview-camera.ts`

Calculates overview camera from world-space bounding box, FOV, viewport aspect ratio, and padding. With `data-zoom-center`, it uses focal element mode: camera faces the center panel and pulls back enough to fit the overall bounding box.

### `vibe-utils/web-3d-panel-navigation/src/projection.ts`

Projects panel corners for screen rects and clip-path handoff. Geometry checks during this investigation suggest the overview camera/math is not the source of initial panel clipping.

## Geometry Check Already Performed

A local Node script recreated the panel layout and projected panel rectangles for representative CSS viewports:

- 1920x1080
- 1536x864
- 1366x768

Computed result: all panel body rectangles fit within the viewport. The `projects` panel gets close to the right edge, but not mathematically clipped.

Representative output:

```text
viewport 1536 864 cameraZ 1627.5
  about    left 540.3  right 995.7  top 303.9  bottom 560.1
  projects left 1018.5 right 1509.7 top 270.0  bottom 546.1
  games    left 1003.0 right 1361.5 top 547.8  bottom 769.0
  resume   left 224.1  right 517.5  top 428.7  bottom 593.5
  contact  left 646.0  right 890.0  top 169.5  bottom 275.5
```

This supports the hypothesis that the camera/framing code is fine and Firefox is clipping/rasterizing incorrectly.

## Current Working Hypothesis

This is likely a Firefox/WebRender bug or limitation involving:

- Windows display scaling at 125% / 150%
- non-integer or changed `window.devicePixelRatio`
- CSS3D transforms / `matrix3d()`
- `transform-style: preserve-3d`
- large DOM/SVG panels
- object-level CSS matrix scale (`scale: 0.5`)
- possibly renderer root `overflow: hidden`
- retained display lists / stale visible rects / raster bounds

The old `.zp-frame` `filter: drop-shadow(...)` was likely not the root cause. It was a style change on hover that forced Firefox to repaint or re-rasterize the layer, temporarily correcting the bad initial raster bounds.

## Research Links

### Three.js CSS3DRenderer limitation

Three.js documentation says `CSS3DRenderer` only supports 100% browser and display zoom:

- <https://threejs.org/docs/pages/CSS3DRenderer.html>

This is highly relevant because Windows Display Scale is display zoom/scaling, even when Firefox page zoom remains 100%.

### MDN devicePixelRatio

MDN explains that `window.devicePixelRatio` is the ratio of physical pixels to CSS pixels. Page zoom affects it; pinch zoom does not. Display scaling also affects the relationship between CSS and physical pixels in practice:

- <https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio>

### MDN transform-style flattening conditions

MDN notes that some grouping property values force used `transform-style` to `flat`, even if `preserve-3d` is specified. Relevant properties include overflow other than `visible`/`clip`, opacity less than 1, filter other than `none`, and clip-path other than `none`:

- <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style>

This matters because the CSS3D renderer root uses `overflow: hidden`; the site formerly used `filter` on SVG frames; navigation uses opacity and clip-path during transitions.

### Firefox / Bugzilla issues related to Windows scaling, transforms, SVG, and clipping

Closest scaling-related bug:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1536409>
  - "CSS is rendered incorrectly when display or browser is scaled"
  - Reproduction includes Windows display scaling at 125%.
  - Component: Core :: Graphics.

Windows 10 display scaling causing incorrect CSS rendering:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1374935>
  - "Windows 10 display scaling causes incorrect CSS border width"
  - Reporter had one monitor at 100% and another at 125%.
  - Firefox rendered incorrectly only at 125%; Chrome/Edge did not.
  - `layout.css.devPixelsPerPx` was mentioned as a workaround but problematic for mixed-monitor setups.

CSS3D / preserve-3d WebRender issue:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1695121>
  - "CSS 3D Transforms breaking when parent has rotate/skew and preserve-3d is used"
  - Open WebRender bug.
  - Incorrect/glitchy placement with preserve-3d and transforms.
  - Style changes in DevTools alter rendering.

Old but conceptually relevant 3D transform clipping bug:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1081185>
  - "CSS 3D transform clipped wrongly"
  - Describes invalid visible rect for a transformed div.

Old but conceptually relevant clipping/mask bug:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1067286>
  - "CSS axis of rotation shifted, image wrongly clipped"
  - Involved device offset for mask layers.

Transformed clip-path WebRender issue:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1765432>
  - "Scaled/transformed clip-paths are not rendered correctly"

SVG/drop-shadow/filter bugs found during the first research round:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=2004578>
  - "svg filter drop shadow rendered incorrectly after scrolling"
  - Reporter noted interacting with the page fixed the issue.
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1859144>
  - "Drop shadow filter is cut off when hovering over SVG image"
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1822189>
  - "filter: drop-shadow() causes image stretching and shadow clipping"
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1836703>
  - "Drop shadow gets cut off"
  - Fixed historical WebRender invalidation issue.
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1918926>
  - "CSS filter makes 3D-transformed element invisible"
  - Same risky combination: filter + preserve-3d.
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1698988>
  - "Intermittently-disappearing elements, with transform-style: preserve-3d when animated"
  - Inspector hover/click can make elements reappear.
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1940210>
  - "Dynamically removing transform-style: preserve-3d causes transformed child to disappear unless styles are nudged"
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1462659>
  - "SVGs become pixelated with transform-style: preserve-3d"
  - Discussion suggests `preserve-3d` can cause SVG layerization/rasterization issues.
- <https://bugzilla.mozilla.org/show_bug.cgi?id=1397671>
  - Historical: "svg inside div with transform-style: preserve-3d is not visible"

### Three.js forum discussions

CSS3DRenderer and SVG/text rasterization discussions:

- <https://discourse.threejs.org/t/css3drenderer-gets-blurry-in-some-situations-what-might-be-the-problem/50179>
- <https://discourse.threejs.org/t/css3d-renderer-blurry-text-on-firefox/26934>
- <https://discourse.threejs.org/t/svg-becomes-blurry-only-when-it-is-too-close-to-camera/42464>

The last discussion includes notes about CSS `clip-path` inside CSS3DRenderer causing immediate rasterization in some cases.

## Suggested Next Debugging Experiments

These are ordered by likely signal.

### 1. Capture environment metrics on each display scale

Log these at startup on the reproducing machine:

```js
console.table({
  devicePixelRatio: window.devicePixelRatio,
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  outerWidth: window.outerWidth,
  outerHeight: window.outerHeight,
  screenWidth: screen.width,
  screenHeight: screen.height,
  availWidth: screen.availWidth,
  availHeight: screen.availHeight,
  visualViewportWidth: window.visualViewport?.width,
  visualViewportHeight: window.visualViewport?.height,
  visualViewportScale: window.visualViewport?.scale,
});
```

Compare 100%, 125%, and 150% Windows display scaling. Also compare the non-reproducing external monitor.

### 2. Test renderer root overflow

In `css3d-renderer.ts`, temporarily change:

```ts
this.domElement.style.overflow = 'hidden';
```

to either:

```ts
this.domElement.style.overflow = 'visible';
```

or oversize the renderer root slightly while keeping the scene container fixed. If the issue disappears, the bug is likely a bad visible/clip rect.

### 3. Oversize CSS3D renderer dimensions

Test whether giving Firefox extra raster/clip room masks the issue:

```ts
const pad = 64;
this.domElement.style.width = `${width + pad * 2}px`;
this.domElement.style.height = `${height + pad * 2}px`;
this.domElement.style.left = `${-pad}px`;
this.domElement.style.top = `${-pad}px`;
```

This will require adjusting the cameraElement centering math or applying equivalent padding carefully. The point is to test whether clipping is caused by edge/raster bounds.

### 4. Remove CSS3D object scale from the matrix path

The library default config uses `scale: 0.5`, and `SceneGraph` applies it as CSS matrix scale:

```ts
object.scale.set(this.config.scale, this.config.scale, this.config.scale);
```

Experiment with `scale: 1` while pre-scaling panel dimensions and layout positions instead. If this fixes Firefox at 125%/150%, the bug may involve compounded CSS matrix scale plus device pixel scaling.

### 5. Replace SVG panels with simple HTML rectangles

Temporarily remove `.zp-frame` SVG markup or hide it:

```scss
.zp-frame {
  display: none;
}
```

Give `.zoom-plane` a simple opaque background/border. If the issue persists, SVG is not required. If the issue disappears, SVG layer/raster bounds are part of the trigger.

### 6. Remove or reduce text effects

Temporarily disable:

```scss
.plane-label {
  text-shadow: none;
}
```

This is lower probability than SVG/CSS3D/overflow, but text shadows can also affect layer/raster bounds.

### 7. Add deliberate post-load invalidation

As a pragmatic workaround, after initialization and after a couple of animation frames, toggle a harmless style/class on the renderer or panel elements.

Example concept:

```ts
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    sceneContainer.classList.add('force-raster-refresh');
    requestAnimationFrame(() => {
      sceneContainer.classList.remove('force-raster-refresh');
    });
  });
});
```

Potential CSS:

```scss
.force-raster-refresh .zoom-plane {
  outline: 1px solid transparent;
}
```

This is not a root fix, but it may confirm the invalidation hypothesis and provide a temporary mitigation.

### 8. Test without WebGL skybox

Temporarily comment out `SkyboxHost` startup in `home.ts`. The issue seems specific to CSS3D panels, but removing the WebGL canvas verifies that two independent rAF renderers/layers are not involved.

### 9. Create a reduced repro

Once a minimal trigger is identified, create a standalone HTML repro with:

- fixed viewport scene container
- CSS perspective
- `transform-style: preserve-3d`
- one or two large transformed divs
- optional inline SVG child
- optional object-level scale

Test at Windows display scaling 100/125/150 in Firefox. This could be attached to a Bugzilla report if needed.

## Things That Seem Less Likely

- Library overview camera math. Computed projected rects fit within viewport.
- Missing render call. The system renders every rAF frame.
- Firefox browser zoom. User kept browser zoom at 100%; Windows Display Scale is the changing variable.
- The SVG drop-shadow filter as root cause. Removing it did not fix initial clipping, though it removed the hover-based repaint workaround.

## Useful Console Checks

The library does not expose the navigator globally by default. For debugging, temporarily add this after construction in `home.ts`:

```ts
(window as typeof window & { zoomNav?: ZoomPlaneNavigator }).zoomNav = navigator;
```

Then inspect:

```js
zoomNav.state
zoomNav.getPlaneConfigs()
zoomNav.getScene().camera.position
zoomNav.getScene().renderer.getSize()
```

Useful DOM checks:

```js
document.querySelector('#scene-container')?.getBoundingClientRect()
document.querySelector('#scene-container > div')?.getBoundingClientRect()
document.querySelector('.zoom-plane[data-zoom-plane="projects"]')?.getBoundingClientRect()
getComputedStyle(document.querySelector('.zoom-plane')).transform
getComputedStyle(document.querySelector('.zp-frame')).filter
```

## Recommended Starting Point For Next Developer

Start with the quickest binary isolation:

1. Confirm reproduction at Windows display scaling 125% or 150% in Firefox.
2. Log `devicePixelRatio`, viewport sizes, and panel `getBoundingClientRect()` values.
3. Hide `.zp-frame` and use simple rectangular panels.
4. Change CSS3D renderer root overflow from `hidden` to `visible`.
5. Test `scale: 1` or remove object-level CSS matrix scaling.

If one of those fixes the clipping, follow that path toward either:

- a real library change that avoids the fragile Firefox path, or
- a Firefox-only workaround guarded by feature/browser detection.
