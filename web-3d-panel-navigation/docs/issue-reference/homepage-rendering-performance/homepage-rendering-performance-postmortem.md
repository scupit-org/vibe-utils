# Consumer Homepage 3D Navigation Rendering Performance Post-Mortem

## Summary

A consumer homepage had rendering performance problems around its CSS3D panel navigation. The issue was most visible while the navigation camera was moving, and GPU usage was high enough that the page needed an architectural performance pass.

The root cause was not a single expensive feature. The cost came from a stack of individually plausible choices that became expensive together:

- large real DOM/SVG panels transformed in CSS3D
- rich panel visuals using full-panel SVG, shadows, filters, text shadows, and animated dots
- a fullscreen `clip-path` content reveal during zoom transitions
- a permanent CSS3D render loop even when the scene was idle
- a permanent fullscreen WebGL skybox render loop
- a skybox configured more expensively than needed for a background layer
- startup work from a parser-blocking homepage script and broad web-font request

The final retained solution changed both the navigation library and the consuming homepage:

- The content reveal now defaults to a transform-based reveal instead of animating fullscreen `clip-path`.
- The CSS3D scene renders on demand rather than every animation frame forever.
- The homepage can disable paint-heavy effects during camera motion.
- The skybox can be configured with lower pixel ratio / antialiasing cost and can be paused while page content is open.
- The homepage uses cheaper skybox settings.
- The homepage script is deferred and the font request is smaller.

After these changes, manual testing showed the navigation was much more performant and used roughly an order of magnitude less GPU. A follow-up regression pass fixed two issues introduced during optimization: panel interactivity after returning to overview, and changed panel visual scale in the consuming homepage.

The one optimization that was not retained for this consumer was `planeScaleMode: "baked-layout"`. It reduced transform complexity, but it changed the visual proportions of rich DOM/SVG panels. The library still supports the option for future experimentation, but rich consumer pages should use the original visual-equivalent CSS3D object scaling path unless baked layout has been verified against their content.

## Affected Code

The performance issue appeared in a rich consumer homepage, but the retained fixes are distributed across both the consumer and the shared navigation package.

Representative consumer files:

- homepage HTML/content template
- homepage navigation initialization script
- homepage stylesheet
- homepage layout/head template

Navigation package files:

- `vibe-utils/web-3d-panel-navigation/src/types.ts`
- `vibe-utils/web-3d-panel-navigation/src/index.ts`
- `vibe-utils/web-3d-panel-navigation/src/animation-timeline.ts`
- `vibe-utils/web-3d-panel-navigation/src/clip-controller.ts`
- `vibe-utils/web-3d-panel-navigation/src/zoom-navigation.ts`
- `vibe-utils/web-3d-panel-navigation/src/scene-graph.ts`
- `vibe-utils/web-3d-panel-navigation/src/styles.scss`
- `vibe-utils/web-3d-panel-navigation/src/skybox/skybox.ts`
- `vibe-utils/web-3d-panel-navigation/src/skybox/skybox-host.ts`
- `vibe-utils/web-3d-panel-navigation/src/skybox/starfield-skybox.ts`

Generated outputs were also refreshed during verification:

- `vibe-utils/web-3d-panel-navigation/dist/`
- `vibe-utils/web-3d-panel-navigation/example/dist/`

## Original Architecture

The homepage uses `@scupit/web-3d-panel-navigation` to turn real DOM elements into CSS3D panels. The package parses panel definitions from `#zoom-planes-source`, creates a Three.js scene and camera, and renders each panel through a custom CSS3D renderer.

Before the optimization pass:

- `ZoomPlaneNavigator` created an `AnimationTimeline`.
- `sceneGraph.render()` was subscribed as a persistent timeline callback.
- The timeline was started in the constructor and kept running.
- Each CSS3D render could update camera and object `matrix3d()` transforms.
- Content reveal was driven by `ClipController.setClipRect()`, which wrote `clip-path: inset(...)` every frame during the reveal.
- `SkyboxHost.start()` ran a separate permanent WebGL `requestAnimationFrame` loop.
- The consumer configured the starfield skybox with `starCount: 10000`.
- `SkyboxHost` used antialiasing, requested `powerPreference: "high-performance"`, and capped renderer pixel ratio at `Math.min(devicePixelRatio, 2)`.
- The bundled homepage script was emitted as a normal parser-blocking classic script in the document head.

The homepage visuals made the CSS3D work much heavier than the package's simple example:

- each panel contains a full-panel SVG frame
- many SVG strokes use `vector-effect: non-scaling-stroke`
- frame SVGs use `filter: drop-shadow(...)`
- labels use `text-shadow`
- the site info box and cards use similar SVG frame effects
- the about panel uses animated glowing dots
- custom fonts and multiple font weights are used above the fold

This meant the browser had to manage large transformed DOM layers whose contents were expensive to rasterize or repaint if invalidated.

## User-Visible Symptoms

The reported problem was high rendering/GPU cost on the homepage, especially while the navigation was in motion.

Specific user-facing behavior before the fix:

- Navigation worked, but the page consumed too much GPU.
- The motion path felt expensive relative to what the UI should require.
- The system did not truly go idle because CSS3D and WebGL loops continued to run.
- The issue was significant enough to require an architectural pass, not only minor style cleanup.

After the first optimization pass, two regressions appeared in the rich consumer homepage:

- Panels were interactive after refresh, but became non-interactive after navigating into a section and returning to overview.
- Panel contents appeared larger than before.

Both regressions were fixed before this postmortem was written.

## Research Findings

This work started from a code review and a follow-up research pass. The research did not point to a single browser bug. Instead, it ranked the likely cost centers and explained why the combination was risky.

The highest-confidence findings were:

- Animated `transform` and `opacity` are the browser-friendly path, but large promoted layers still have memory, raster, upload, and management cost.
- Fullscreen `clip-path` animation is a strong suspect for paint-bound motion. It is not safe to assume `clip-path: inset(...)` is compositor-only across browsers.
- Shadows, blur-like effects, filters, and text shadows increase paint/raster cost.
- Large real DOM/SVG surfaces transformed through CSS3D can still be expensive even if the transform itself is compositor-friendly.
- Continuous `requestAnimationFrame` loops prevent the page from going idle and reduce headroom for interaction.
- WebGL cost scales with drawing-buffer size, pixel ratio, antialiasing, and fullscreen fill rate.
- The raw 10,000-star count was less important than the combined skybox configuration: fullscreen canvas, high DPR, antialiasing, and continuous animation.
- Startup work from blocking scripts and broad font requests was real, but secondary to the in-motion cost.

These findings led to a priority order:

1. Replace or isolate the fullscreen `clip-path` reveal.
2. Disable or reduce paint-heavy styles during motion.
3. Stop continuous CSS3D and WebGL rendering when idle or hidden.
4. Lower skybox DPR, antialiasing, and star count.
5. Keep JS micro-optimizations secondary unless profiling showed GC pressure.

## Primary Suspects And Final Treatment

### Fullscreen `clip-path` Reveal

The original content reveal wrote a fullscreen `clip-path: inset(...)` every frame while zooming into or out of a panel.

This was treated as a primary issue because:

- the animated element covers the viewport
- the property is not reliably compositor-only
- it overlaps with opacity and large page content
- it runs exactly during the critical camera motion path

Final treatment:

- Add `revealMode` to `NavigationConfig`.
- Default to `revealMode: "transform-mask"`.
- Keep `revealMode: "clip-path"` as a compatibility fallback.
- Implement transform reveal in `ClipController` using an outer transform and inverse inner transform.

The transform reveal shrinks/moves the content container to the reveal rectangle and inversely transforms an inner wrapper so the page content remains visually aligned. This keeps the active per-frame work closer to transform and opacity updates instead of fullscreen clip-path mutation.

### Permanent CSS3D Render Loop

The package previously rendered the CSS3D scene every animation frame, including idle overview and section states.

This was treated as a primary issue because:

- the scene contains large real DOM/SVG layers
- CSS transform writes and layer bookkeeping were being considered every frame
- idle CPU/GPU headroom matters before a user starts an interaction
- the page could not truly go idle

Final treatment:

- Make `AnimationTimeline` on-demand.
- Do not start the timeline in the navigator constructor.
- Remove the persistent `sceneGraph.render()` subscriber.
- Start the timeline only when `runSequence()` creates active work.
- Render inside the active animation sequence callbacks.
- Add `requestRender()` for resize, overview recalculation, return completion, and other one-off changes.

The CSS3D scene still renders during transitions, but it no longer renders continuously forever.

### Permanent WebGL Skybox Loop

The homepage skybox was a fullscreen WebGL canvas with its own rAF loop. It rendered continuously even when the user was reading section content and the CSS3D scene was hidden.

This was treated as a strong secondary issue because:

- fullscreen WebGL cost scales with pixel count
- antialiasing and high DPR increase GPU cost
- a decorative background does not need to render while hidden behind content

Final treatment:

- Add `pixelRatio`, `antialias`, `powerPreference`, `autoStart`, and `externalFrameLoop` options to `SkyboxHost`.
- Add `renderFrame(dt)` and `setPixelRatio()`.
- Add optional `setPixelRatio()` to the `Skybox` interface.
- Add `pixelRatio` support to `createStarfieldSkybox`.
- In the consumer homepage, use `starCount: 2500`, `pixelRatio: 1`, and `antialias: false`.
- Stop the skybox when navigation state is `section`.
- Restart it for `overview`, `zooming-in`, and `zooming-out`.

This preserves the skybox visual in overview and transition states while avoiding unnecessary rendering behind section content.

### Paint-Heavy Panel Effects

The homepage intentionally uses a rich visual style: SVG frames, glow effects, text shadows, and animated dots. Those effects are acceptable at rest, but expensive during camera motion over large transformed DOM panels.

Final treatment:

- `ZoomPlaneNavigator` toggles `html.w3dpn-is-moving` while in `zooming-in` or `zooming-out`.
- The consumer stylesheet uses that class to reduce motion-time visual cost:
  - remove SVG frame filters
  - remove text shadows
  - remove panel box shadows
  - stop dot animations
  - suppress certain transitions while moving

This is a good compromise for this UI. The full visual treatment returns once the scene is idle, where it is less likely to cause animation jank.

### Click-Start Render Work

The old `precomputePlaneRect()` temporarily moved the camera to the target, rendered the CSS3D scene, computed the rect, restored the camera, and rendered again.

This was suspicious because doing render/style work synchronously at click start can make interaction feel sticky.

Final treatment:

- Remove the two `sceneGraph.render()` calls from `precomputePlaneRect()`.
- Keep the camera math needed to compute the target rect.

This reduces click-start work and avoids doing extra DOM transform writes before the transition begins.

### Startup Work

Startup was not the main in-motion bottleneck, but it was still worth cleaning up.

Final treatment in the consumer homepage layout:

- Emit bundled homepage scripts with `defer`.
- Reduce the Google Fonts request from several families and many weights to the weights used by the homepage.

## Library Changes

### Configuration Surface

`NavigationConfig` now includes:

```ts
revealMode: 'transform-mask' | 'clip-path';
planeScaleMode: 'css-transform' | 'baked-layout';
```

Defaults:

```ts
revealMode: 'transform-mask';
planeScaleMode: 'css-transform';
```

`RevealMode` and `PlaneScaleMode` are exported from the package entry point.

### Transform-Based Content Reveal

`ClipController` now owns two reveal strategies:

- `clip-path`: old behavior
- `transform-mask`: new default behavior

For `transform-mask`, the controller wraps content in:

```html
<div class="w3dpn-content-transform-inner">
  ...
</div>
```

During reveal, the outer content container is transformed to the screen-space reveal rectangle. The inner wrapper is inversely transformed so the active page section appears in the same viewport-aligned position instead of visually scaling with the outer container.

The package stylesheet now includes:

- `transform-origin: top left`
- `will-change: transform, opacity`
- `.w3dpn-content-transform-inner`
- pointer-event defaults for the content layer

### Explicit Pointer Ownership

After the first optimization pass, the rich consumer homepage exposed a critical interaction regression: the full-screen content container could remain above the CSS3D scene and swallow pointer events after returning to overview.

The fixed interaction contract is:

- In overview, `#page-content-container` must not receive pointer events.
- In section/content states, `#page-content-container` must receive pointer events.
- In section state, `#scene-container` is hidden and non-interactive.
- When returning to overview, `#scene-container` is visible and interactive again.

Retained fix:

- `ClipController.setVisible(true)` sets `this.container.style.pointerEvents = 'auto'`.
- `ClipController.setVisible(false)` sets `this.container.style.pointerEvents = 'none'`.
- The constructor seeds inline pointer state from the initial class state.
- `hideSceneContainer()` sets scene pointer events to `none`.
- `showSceneContainer()` sets scene pointer events to `auto`.

This makes pointer ownership explicit instead of relying on `opacity`, `clip-path`, or class cascade alone.

### Scene Visibility Hardening

The scene hide/show path now uses a visibility token:

- `hideSceneContainer()` increments the token and captures it.
- The `transitionend` handler only applies `fully-hidden` if the token still matches.
- The handler ignores transition events from child elements and only responds to the scene container's own `opacity` transition.
- `showSceneContainer()` increments the token so stale hide handlers cannot hide a scene that has already been shown again.

`showSceneContainer()` also schedules the existing raster/hit-test refresh and requests a render. This is consistent with the earlier Firefox rendering postmortem: transformed CSS3D surfaces can need a deliberate invalidation after visibility changes.

### On-Demand Animation Timeline

`AnimationTimeline` now starts only when there is work:

- `runSequence()` calls `start()`.
- `start()` returns without scheduling rAF if there are no subscribers or active sequences.
- `tick()` schedules the next frame only if work remains.
- When sequences and subscribers are empty, the timeline sets `running = false`.

The navigation package no longer uses a permanent render subscriber.

### CSS3D Render Scheduling

`ZoomPlaneNavigator` now renders:

- once after initial camera setup
- once per transition frame while zooming in/out
- on resize/recalculate through `requestRender()`
- after returning to overview
- when the scene is shown again

This preserves visual correctness without a forever render loop.

### Plane Opacity Write Cache

`SceneGraph.setPlaneOpacity()` now caches the last written opacity string per plane and skips duplicate DOM writes.

This is a small optimization, not a primary fix. It reduces avoidable style writes during fade sections of the transition.

### Experimental Baked Layout

`SceneGraph` supports:

```ts
planeScaleMode: 'baked-layout'
```

When enabled, the element dimensions are multiplied by the navigation scale and the CSS3D object scale is set to `1`.

This was intended to reduce one layer of transform work. It is not recommended for rich DOM/SVG panels unless visual equivalence has been verified. See "Scaling Regression" below.

## Skybox Changes

`SkyboxHostOptions` now supports:

```ts
antialias?: boolean;
powerPreference?: WebGLPowerPreference;
pixelRatio?: number | ((devicePixelRatio: number) => number);
autoStart?: boolean;
externalFrameLoop?: boolean;
```

The renderer defaults were made cheaper:

- `antialias` defaults to `false`
- `powerPreference` defaults to `"default"`
- pixel ratio defaults to `Math.min(window.devicePixelRatio, 1.5)` instead of `2`

New methods:

```ts
setPixelRatio(pixelRatio?: SkyboxHostOptions["pixelRatio"]): void;
renderFrame(dt = 0): void;
```

The `Skybox` interface now optionally supports:

```ts
setPixelRatio?(pixelRatio: number): void;
```

`createStarfieldSkybox()` now accepts:

```ts
pixelRatio?: number;
```

and updates its `uPixelRatio` uniform when the host pixel ratio changes.

These changes make the WebGL background tunable by consumers instead of baking in expensive assumptions.

## Consumer Changes

### Homepage Navigation Config

The consumer homepage now constructs the navigator with:

```ts
new ZoomPlaneNavigator(refs, {
  revealMode: "transform-mask",
});
```

`planeScaleMode: "baked-layout"` was tried and then removed after the scaling regression. The consumer now uses the package default:

```ts
planeScaleMode: "css-transform"
```

### Homepage Skybox Config

The homepage skybox changed from:

```ts
createStarfieldSkybox({ starCount: 10000 })
```

to:

```ts
createStarfieldSkybox({
  starCount: 2500,
  pixelRatio: 1,
})
```

and `SkyboxHost` now receives:

```ts
antialias: false,
pixelRatio: 1,
```

The homepage state handler pauses the skybox in `section` state and starts it otherwise.

### Motion-Time Style Simplification

The consumer stylesheet now includes an `html.w3dpn-is-moving` block.

During zoom transitions it disables:

- `.zoom-plane` box shadows
- `.zp-frame`, `.pc-frame`, `.bb-frame`, `.sc-frame` filters
- label/title/text shadows
- about-dot animation and glow
- selected transitions

This targets the expensive effects only while camera motion is underway.

### Startup Cleanup

The consumer homepage layout now emits bundled homepage scripts as:

```html
<script src="{{ script }}" defer></script>
```

The Google Fonts request was reduced to the required families and weights for the homepage:

- Chakra Petch: `400`, `500`, `600`, `700`
- JetBrains Mono: `400`

The previous request included additional weights and loaded the Rajdhani family. Rajdhani may still appear in the CSS fallback stack, but it is no longer requested as a web font.

## Regressions And Follow-Up Fixes

### Interactivity Regression

After the first optimization pass, the panels in the rich consumer homepage were only interactive until the first navigation. On refresh, hover and click worked. After clicking a panel, entering its content, and returning to overview, panels no longer reacted to mouse input.

Browser back/forward still worked because the navigation state machine and URL sync were still functional. The problem was pointer delivery, not navigation logic.

The key interaction model:

- CSS3D panels live in `#scene-container`.
- Page content lives in `#page-content-container`.
- `#page-content-container` sits above the scene with a higher z-index.
- In overview, the content container must be non-interactive.
- In section state, the scene can be hidden and content must be interactive.

The transform reveal made this model more sensitive. The old `clip-path` path could accidentally make the hidden content layer less relevant for hit testing. With transform reveal, the full-screen content container still exists above the scene, so pointer-events must be explicit.

Fixes retained in the library:

- Inline pointer-events on content visibility changes.
- Inline pointer-events on scene hide/show.
- Scene visibility token to ignore stale hide transition completions.
- Transitionend filtering to the scene container's own opacity transition.
- A raster/hit-test refresh when the scene is shown again.

This fix lives primarily in the navigation library, not in consumer code, because the library owns the scene/content overlay state machine.

### Scaling Regression

After the first optimization pass, elements on the rich consumer panels looked larger.

Cause:

- The consumer opted into `planeScaleMode: "baked-layout"`.
- In the original mode, the DOM element keeps its authored width/height and the CSS3D object is scaled.
- In baked layout mode, the element width/height are scaled directly and object scale is `1`.
- Those are not visually equivalent for rich DOM content.

Text, SVG strokes, fixed pixel measurements, and `rem` sizing are affected differently when the element's own dimensions change rather than the rendered subtree being transformed.

Fix:

- Remove `planeScaleMode: "baked-layout"` from the consumer navigation config.
- Keep the library default `planeScaleMode: "css-transform"`.

This fix lives in consumer configuration because the problematic opt-in was specific to rich panel content. The library option remains available for simpler panels or future experiments.

## Final Retained Optimization Set

The retained high-value optimizations are:

- transform-based reveal as the default reveal strategy
- on-demand CSS3D rendering
- no permanent CSS3D render subscriber
- no click-start double render
- motion-time visual simplification in the consumer stylesheet
- cheaper skybox pixel ratio and antialiasing settings
- lower star count
- skybox pause while section content is open
- smaller homepage font request
- deferred homepage script
- explicit pointer ownership between scene and content overlay

The optimization not retained for this consumer:

- `planeScaleMode: "baked-layout"`

The library still exposes `baked-layout`, but it should be considered experimental until it can preserve rich panel visual proportions.

## Why The Final Fixes Worked

The successful changes worked because they targeted the actual expensive work instead of trying to remove the 3D concept.

The `clip-path` replacement reduced paint-bound fullscreen reveal work during the most performance-sensitive part of the interaction.

The on-demand timeline removed continuous CSS3D render cost when the scene is visually idle.

The skybox configuration reduced fullscreen WebGL fill-rate cost and stopped rendering when hidden behind content.

The motion class kept the rich visual design at rest but removed expensive raster effects during movement.

The pointer-event hardening fixed an interaction issue exposed by the new transform reveal. This did not materially trade off performance; it made the state machine explicit.

The rollback from `baked-layout` restored visual correctness. That rollback likely explains the small GPU increase observed after the regression fix, but it was the right tradeoff. `baked-layout` was an optimization that changed visual semantics for complex panels.

## What Was Not Done

Several potential optimizations were intentionally deferred:

- SVG panel frames were not rasterized.
- The WebGL and CSS3D frame loops were not fully merged into one scheduler.
- Shadows and filters were not permanently removed.
- `baked-layout` was not redesigned into a visual-equivalent optimization.
- No formal Chrome/Firefox DevTools trace files were attached to this postmortem.
- No browser-specific `clip-path` detection was added.
- No public API was added for motion-time effect suppression beyond the document class.

These were deferred because the retained changes solved the practical performance issue without sacrificing the consumer homepage's visual design.

## Verification

Navigation package verification:

```text
npm test
```

Result:

```text
Test Suites: 3 passed, 3 total
Tests: 50 passed, 50 total
```

Package build:

```text
npm run build
```

Result: passed.

Package example build:

```text
npm run example:build
```

Result: passed.

The consumer's production build also passed.

Manual consumer testing confirmed:

- `vibe-utils/web-3d-panel-navigation` example remained functional.
- the rich consumer homepage performance improved substantially.
- GPU usage was much lower than the original version.
- The post-navigation mouse interactivity regression was fixed.
- The panel visual scaling regression was fixed.
- The consumer uses slightly more GPU after reverting `baked-layout`, but remains much more performant than the original version.

## Lessons Learned

Large CSS3D DOM panels can be performant enough, but only if the surrounding system avoids unnecessary work.

The expensive part was not just `matrix3d()`. The expensive part was the combination of large transformed DOM/SVG layers, paint-heavy effects, fullscreen reveal clipping, and continuous render loops.

Motion-time simplification is a strong strategy for this kind of UI. The user sees the rich styling when the scene is idle, while the browser does less paint-heavy work during movement.

Invisible fullscreen layers must have explicit pointer-event state. Relying on opacity, clipping, or implied visibility is fragile when the reveal implementation changes.

CSS3D object scaling and baked DOM sizing are not equivalent for rich content. They affect text, SVG, stroke behavior, and CSS sizing differently.

Simple package examples are useful but insufficient. The package example did not expose the same regressions because it has much simpler panel content and did not opt into `baked-layout`. Complex real consumer pages should remain part of the verification loop.

## Future Follow-Up

### Visual-Equivalent Baked Layout

If more GPU reduction is needed, revisit `planeScaleMode: "baked-layout"` with a design that preserves visual proportions.

One possible direction:

- bake the outer panel dimensions for cheaper layer geometry
- add an inner wrapper with compensating scale
- preserve authored text/SVG proportions inside the panel
- verify against full rich consumer panels, not only the package example

Until then, `baked-layout` should not be enabled for rich DOM/SVG panels unless the consumer verifies that its visual proportions are preserved.

### Shared Frame Scheduler

The current system has on-demand CSS3D rendering and a separately pausable WebGL skybox. A future version could coordinate both through one frame scheduler.

Potential benefits:

- clearer frame budget ownership
- one state machine for idle/moving/hidden
- easier instrumentation
- explicit skip rules for CSS3D and WebGL stages

This is not required for the current performance fix.

### Richer Package Example

The package example should eventually include an optional "heavy panel" scenario that more closely resembles real rich consumers:

- full-panel SVG frames
- text shadows
- filters
- multiple panel sizes
- content overlay reveal
- back/return flow

This would catch regressions that simple panels do not expose.

### Interaction Regression Tests

The package should eventually have a browser-level test or manual test checklist for:

- click a panel
- return to overview
- hover another panel
- click another panel
- repeat after URL back/forward

The bug was not in the state machine alone; it was in browser pointer ownership, so a real browser test is more valuable than a pure unit test.

### Profiling Checklist

A short profiling guide should be added for future work:

- compare idle overview, zoom-in, section, and return-to-overview
- check FPS and long frames
- inspect paint flashing during reveal
- inspect layer sizes/counts
- compare skybox DPR and antialias settings
- test with and without motion-time CSS simplification
- test `baked-layout` only against rich panels

### Consumer Guidance

Document recommended defaults for performance-sensitive consumers:

- prefer `revealMode: "transform-mask"`
- keep rich shadows/filters out of active motion where possible
- use lower skybox DPR for decorative backgrounds
- pause WebGL backgrounds when hidden
- keep `planeScaleMode: "css-transform"` unless the panel content is known to tolerate baked dimensions

## Current Status

The performance issue is resolved for the current rich consumer homepage.

The final system keeps the major performance wins while preserving homepage visuals and interaction:

- CSS3D rendering no longer runs forever.
- Content reveal no longer depends on animated fullscreen `clip-path` by default.
- Skybox cost is lower and paused while hidden.
- Paint-heavy effects are disabled during navigation motion.
- Panel interactivity works after returning to overview.
- Panel visual proportions are restored.

The remaining opportunity is not an urgent bug fix. It is future optimization work: recovering the extra savings from `baked-layout` without changing rich panel rendering semantics.
