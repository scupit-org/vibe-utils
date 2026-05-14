# Zoom Plane Navigation System (`@scupit/web-3d-panel-navigation`)

## Overview

The Zoom Plane Navigation System is a fullscreen, viewport-owned 3D navigation interface for websites. It arranges rectangular "zoom planes" in 3D space - similar to monitors on a desk, papers on a table, or posters on a wall - and lets users click any plane to zoom into it. When zoomed in, the system reveals the associated page content through an animated `clip-path` transition, creating the illusion of zooming "into" the plane's surface.

This document describes the fifth reference attempt as it now exists inside the extracted package. Older attempt docs are still useful historical references, but this file is the primary source of truth for how the package works today.

### Package Scope

Version 1 intentionally preserves the current system shape:

- Fullscreen and viewport-owned
- CSS3D scene rendered with Three.js math and DOM elements
- Plane definitions provided declaratively through HTML data attributes
- Built-in clip-path content reveal system
- Built-in body scroll locking, Escape handling, resize handling, and optional back button behavior
- Shipped structural CSS and default component styling, with theming done mainly through CSS variables

### Key Features

- Reusable library with injected DOM references via `ContainerRefs` (resolved by `resolveContainerRefs()` against required convention IDs)
- Declarative plane configuration via HTML data attributes
- Arbitrary 3D rotation on all Euler axes
- Unified animation timeline to avoid dead frames between camera and content phases
- Adaptive camera transitions that select between Early Look and Orbit styles
- Time-reversed zoom-out so return animations visually retrace zoom-in
- Auto-calculated overview camera framing with resize recalculation
- Validation for duplicate IDs, multiple focal planes, malformed attributes, and missing content sections
- Public event system for navigation lifecycle hooks
- Accessible content model: page sections remain normal HTML in the DOM

### Use Cases

- Multi-monitor desk layouts for portfolio navigation
- Bulletin boards, cork boards, and game-style menu screens
- Gallery walls and visual storytelling layouts
- Branded landing pages built around a small number of explorable surfaces

---

## Current Package Context

### Historical Boundary

The fourth and fifth reference attempts were originally developed inside the Eleventy prototype site at the root of this repository. That is no longer where the implementation lives.

Current source of truth:

- Package runtime: `web-3d-panel-navigation/src/`
- Package stylesheet source: `web-3d-panel-navigation/src/styles.scss`
- Example app: `web-3d-panel-navigation/example/`
- Developer docs: `web-3d-panel-navigation/docs/`

The top-level `src/fifth-reference-attempt/` page in the Eleventy project is now a consumer of the package, not the implementation itself.

### Installing and Importing

```bash
npm install @scupit/web-3d-panel-navigation three
```

```ts
import { ZoomPlaneNavigator } from '@scupit/web-3d-panel-navigation';
import '@scupit/web-3d-panel-navigation/styles.css';
```

`three` is a peer dependency. The package expects to run in the browser.

### Minimal Setup

The runtime is library-first: it operates on injected DOM references via the `ContainerRefs` struct. To keep the consumer-side boilerplate minimal, the package also exposes a `resolveContainerRefs()` helper that looks up the four required elements by ID. Both the helper and the shipped stylesheet target the same convention IDs — they are part of the package contract, not configurable. Advanced consumers (e.g. tests) can still build a `ContainerRefs` manually and pass it directly.

```html
<div id="zoom-planes-source">
  <div class="zoom-plane"
       data-zoom-plane="about"
       data-section="page-about"
       data-width="1600"
       data-height="900"
       data-position="0, 0, 0"
       data-rotation="0, 0, 0"
       data-zoom-center>
    <span class="plane-label">About</span>
  </div>
</div>

<div id="scene-container"></div>

<div id="page-content-container">
  <section id="page-about" class="page-section">
    <h1>About</h1>
    <p>Normal HTML content goes here.</p>
  </section>
</div>

<button id="back-button" class="back-button hidden">Back to Overview</button>
```

```ts
import { ZoomPlaneNavigator, resolveContainerRefs } from '@scupit/web-3d-panel-navigation';

const navigation = new ZoomPlaneNavigator(resolveContainerRefs());
```

### Styling Model

The package ships the crucial structural CSS and the default visual styling for planes, sections, cards, and the back button. Consumers should import the package stylesheet and then override CSS variables for theming.

High-level rule:

- Import `@scupit/web-3d-panel-navigation/styles.css`
- Keep the default selectors unless you are intentionally replacing the package CSS contract
- Customize colors, gradients, fonts, and surfaces via CSS custom properties

Example theme override:

```css
:root {
  --w3dpn-font-family: 'Segoe UI', system-ui, sans-serif;
  --w3dpn-page-background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  --w3dpn-plane-background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
  --w3dpn-plane-border-hover-color: #60a5fa;
  --w3dpn-link-color: #93c5fd;
}
```

---

## Background: Evolution from Fourth Attempt

### Problems with the Fourth Attempt

The fourth attempt provided a working implementation but had architectural and experiential problems:

| Issue | Fourth Attempt | Root Cause |
|-------|----------------|------------|
| Transition seam | 1-2 dead frames between camera arrival and clip reveal | Sequential animation phases in separate rAF loops |
| Zoom-out plane pop | Plane opacity returned abruptly | No smooth fade-in during return |
| No cancellation | Escape could not abort mid-animation cleanly | Independent Promises with no coordinated cancel path |
| God object | `ZoomPlaneScene` mixed too many concerns | Rendering, camera framing, parsing, resize, and visibility all lived together |
| Hard-coded DOM assumptions | Implementation depended on specific page structure | Not originally designed as a portable package |
| Resize framing drift | Resize updated aspect ratio but not overview framing | Overview state not recalculated |
| `setTimeout` visibility sync | CSS timing and JS timing could drift | Timing tied to magic numbers |
| Config duplication | Each module merged config separately | No single frozen config reference |
| Derived target hack | Camera target reconstructed with a guessed distance | Three.js camera does not store look-at target |

### Goals for the Fifth Attempt

1. Eliminate the transition seam with a unified timeline.
2. Make zoom-out visually coherent with zoom-in.
3. Support animation cancellation via Escape.
4. Decompose the god object into focused modules.
5. Make the system package-friendly by injecting DOM references.
6. Recalculate overview framing on resize.
7. Replace timeout-based CSS synchronization with `transitionend`.
8. Share one frozen config object across the runtime.
9. Move easing and interpolation logic into dedicated utilities.
10. Store camera targets explicitly instead of deriving them heuristically.

---

## Design Rationale

### Why Keep Three.js?

Three.js handles the scene graph, vectors, matrices, Euler angles, and projection math. The package uses that battle-tested math layer while rendering real DOM surfaces through CSS3D rather than WebGL.

### Why CSS3D Instead of WebGL?

The planes are real DOM nodes transformed in 3D with CSS `matrix3d()` values. That keeps text crisp, preserves HTML interactivity, and avoids rendering DOM content into textures.

### Why a Unified Animation Timeline?

The fourth attempt used separate animation phases. That introduced a visible seam: camera motion would finish, then the clip reveal would start on the next frame. The fifth attempt drives camera motion, content reveal, and visibility changes inside one timeline so phase overlap is deterministic and frame-perfect.

### Why Overlap the Camera Tail and Clip Start?

Even a very short sequential gap still reveals a mismatch between a nearly-perpendicular plane and a fully axis-aligned clip. Starting the clip during the tail of the camera movement makes the transition visually continuous.

### Why Keep the System Viewport-Owned in V1?

The current package is intentionally narrow in scope. It owns the viewport, scroll locking, and fixed-position containers because that is the behavior already proven by the fifth attempt. Container-scoped rendering can be a later evolution once the package baseline is stable.

### Why Keep the Clip-Path Reveal in the Package?

The system is not just a camera controller. The illusion depends on the handoff between the 3D surface and the revealed HTML section. Splitting the clip-path content system out now would make the package less representative of the working design.

### Why Decompose the Fourth Attempt's God Object?

The fourth attempt's `ZoomPlaneScene` handled scene setup, plane creation, overview camera framing, resize updates, rendering, and visibility behavior in one place. The fifth attempt separates those responsibilities into focused modules so camera math, DOM parsing, rendering, and navigation logic can evolve independently.

### Why Store the Camera Target Explicitly?

Three.js cameras do not retain a canonical "look-at target." The package stores the target explicitly in `CameraController`, which makes state snapshots accurate and avoids the old `getWorldDirection() * guessedDistance` workaround.

### Why an Adaptive Transition Instead of a Single Camera Path?

No single transition felt right across all panel orientations. Small-angle cases benefit from a quicker reorientation. Large-angle cases benefit from a sweeping orbital path. The runtime computes total reorientation and dispatches between Early Look and Orbit accordingly.

### Why Time-Reverse Zoom-Out?

Early Look is intentionally asymmetric. If you play it forward in the opposite direction, the camera rotates and translates in the wrong perceptual order. The package solves that by evaluating the zoom-in transition backward during zoom-out.

### Why `transitionend` Instead of `setTimeout`?

Visibility state should track actual CSS completion, not a guessed duration. `transitionend` stays correct even if CSS timing changes later.

---

## Core Concept: Zoom Planes

A zoom plane is a rectangular surface in 3D space that users can click to zoom into. Each plane has:

- A world position `(x, y, z)`, either explicit or computed from tiled layout
- A rotation `(x, y, z)` in degrees, either explicit or computed from tiled layout
- A width and height in world units
- A linked content section ID
- An optional focal-plane marker for overview framing

### HTML Data Attribute Schema

```html
<div id="zoom-planes-source">
  <div class="zoom-plane"
       data-zoom-plane="unique-id"
       data-section="page-section-id"
       data-width="1920"
       data-height="1080"
       data-position="0, 0, 0"
       data-rotation="0, 30, 0"
       data-zoom-center>
    <span class="plane-label">About</span>
  </div>
</div>
```

#### Required Base Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| `data-zoom-plane` | Unique plane identifier | `"left"`, `"about"` |
| `data-section` | ID of the section revealed when zoomed in | `"page-about"` |
| `data-width` | Plane width in world units | `"1920"` |
| `data-height` | Plane height in world units | `"1080"` |

#### Layout Attributes

Use either explicit layout or tiled layout.

| Attribute | Description | Example |
|-----------|-------------|---------|
| `data-position` | Position as `x, y, z` | `"-850, 0, 100"` |
| `data-rotation` | Rotation as `x, y, z` degrees | `"0, 30, 0"` |
| `data-tile-from-right` | Attach this plane's left edge to the reference plane's right edge | `"about"` |
| `data-tile-from-left` | Attach this plane's right edge to the reference plane's left edge | `"about"` |
| `data-tile-from-top` | Attach this plane's bottom edge to the reference plane's top edge | `"about"` |
| `data-tile-from-bottom` | Attach this plane's top edge to the reference plane's bottom edge | `"about"` |
| `data-tile-angle` | Tiled rotation angle in degrees; positive folds inward toward the reference plane's front side | `"30"` |
| `data-tile-gap` | Optional spacing away from the reference edge in world units. | `"45"` |
| `data-tile-align` | Optional edge alignment. Use `top`, `center`, or `bottom` for left/right tiles; `left`, `center`, or `right` for top/bottom tiles. | `"top"` |
| `data-tile-align-offset` | Optional extra nudge along the alignment axis in world units. | `"-90"` |
| `data-tile-offset` | Optional advanced additive reference-local hinge offset. `x` follows reference right, `y` follows reference up. Values use world units like `data-position`. | `"40, -20"` |
| `data-tile-rotation-offset` | Optional reference-relative Euler rotation offset in degrees. Keeps the attached edge center anchored but can intentionally make the edge imperfectly flush. | `"0, 2, -1"` |

Tiled defaults are `data-tile-gap="0"`, `data-tile-align="center"`, `data-tile-align-offset="0"`, `data-tile-offset="0, 0"`, and `data-tile-rotation-offset="0, 0, 0"`. The final hinge offset is computed from gap/alignment first, then `data-tile-align-offset`, then the manual `data-tile-offset`.

`data-position` and `data-rotation` are the explicit layout attributes. Tiled layout omits both and uses one side reference plus an angle:

```html
<div class="zoom-plane"
     data-zoom-plane="right"
     data-section="page-right"
     data-width="1280"
     data-height="720"
     data-tile-from-right="unique-id"
     data-tile-angle="30"
     data-tile-gap="45"
     data-tile-align="top"
     data-tile-rotation-offset="0, 2, -1">
  <span class="plane-label">Right</span>
</div>
```

Supported side references are `data-tile-from-right`, `data-tile-from-left`, `data-tile-from-top`, and `data-tile-from-bottom`. Positive `data-tile-angle` folds the tiled plane inward toward the reference plane's front side. `data-tile-gap`, `data-tile-align`, `data-tile-align-offset`, `data-tile-offset`, and `data-tile-rotation-offset` are interpreted relative to the reference plane's position and rotation.

#### Optional Attributes

| Attribute | Description |
|-----------|-------------|
| `data-zoom-center` | Marks the focal plane used by Focal Element overview framing |

### Validation

The parser and navigator fail fast when the scene contract is invalid.

Validation includes:

- Missing required attributes
- Invalid numeric values
- Duplicate `data-zoom-plane` IDs
- More than one `data-zoom-center` plane
- Invalid tiled layout references, cycles, or mixed explicit/tiled layout attributes
- Missing matching content sections inside the provided content container

---

## Animation Flow

### The Key Insight: The Clip Reveal Only Works From a Perpendicular View

The 2D content reveal must line up with the projected plane. That only works cleanly when the camera is looking directly at the plane surface.

At the perpendicular view:

- The plane appears axis-aligned on screen
- Its bounds can be represented as a simple rectangular `clip-path`
- The content can stay untransformed and readable

### Zoom-In Sequence

1. User clicks a plane while the system is in `overview`.
2. The camera begins moving toward the plane's perpendicular view.
3. Near the tail of that movement, the content clip starts expanding from the projected plane rect.
4. Plane opacity fades out as the content reveal takes over.
5. The active section becomes the visible HTML page.
6. The scene fades and can become fully hidden while the content container becomes scrollable.

### Zoom-Out Sequence

1. User triggers return with the back button or Escape.
2. Body scrolling is locked and the page scroll position is reset to the top.
3. The scene is made visible again behind the content.
4. The content clip shrinks from the viewport back toward the plane rect.
5. Plane opacity fades back in.
6. The camera returns to the overview by replaying the zoom-in transition backward.
7. State returns to `overview`.

### Why Time-Reversal Matters

For symmetric transitions, reversing direction is trivial. For Early Look, it is not. Time-reversal guarantees that the camera perceptually retraces its path rather than rotating too early during zoom-out.

---

## Camera Transitions

### The "Slide Then Rotate" Problem

A naive linear interpolation tends to hide angular change until the camera is close to the target, so the motion feels like a slide followed by a late rotation.

### Adaptive Selection

The package computes total reorientation from both:

- Forward-vector change
- Up-vector change

That matters because roll and tilt changes are visible even when the forward angle alone appears small.

### Early Look

Use case: planes already facing roughly toward the viewer.

Behavior:

- Reorientation is front-loaded
- The transition feels snappier and more intentional
- Best when the angular change is modest

### Orbit

Use case: planes with stronger directional differences.

Behavior:

- Camera rotation is distributed more evenly through the move
- The motion feels more cinematic and less like a two-step correction
- Best when the camera must meaningfully swing around to face the target

---

## Camera Positioning Modes

The overview camera uses one of two framing strategies.

### Mode 1: Focal Element Mode

Trigger: exactly one plane has `data-zoom-center`.

Behavior:

- Camera aligns perpendicular to the focal plane's surface
- The focal plane is placed dead-center in the viewport
- Distance still expands enough to keep the full scene in frame

Best use cases:

- Hero element emphasis
- Menu-like compositions
- Branded experiences where one surface should dominate attention

Tradeoff:

- The overall scene may be less visually balanced because one element is privileged

### Mode 2: Balanced Scene Mode

Trigger: no plane has `data-zoom-center`.

Behavior:

- Camera centers on the geometric center of the scene bounding box
- All elements share the frame more evenly
- The composition feels more observational and less staged

Best use cases:

- Exploration layouts
- Natural desk or wall arrangements
- Scenes where all planes should feel equally important

Tradeoff:

- No single plane receives the strong hero treatment of focal mode

### Auto-Camera Distance Calculation

The overview distance is calculated dynamically from:

1. The world-space bounding box of all planes
2. The active field of view
3. The viewport aspect ratio
4. Configured overview padding

Step-by-step:

1. For each plane, compute its four corners in local space.
2. Apply the plane's rotation and translation.
3. Track the min/max extents across the entire scene.
4. Add padding so the framing does not feel cramped.
5. Compute the distance required to fit the padded width.
6. Compute the distance required to fit the padded height.
7. Use the larger of the two values.

```text
distanceForHeight = (paddedHeight / 2) / tan(FOV / 2)
distanceForWidth  = (paddedWidth / 2) / (tan(FOV / 2) * aspectRatio)
requiredDistance  = max(distanceForHeight, distanceForWidth)
```

In Focal Element mode, the final position is aligned to the focal plane normal. In Balanced Scene mode, the camera is positioned relative to the scene center.

### Resize Handling

While the system is in `overview`, viewport resize triggers a recalculation of overview framing so all planes remain in frame.

---

## Architecture and Module Breakdown

The runtime is split into focused modules with clear ownership boundaries.

### Package Layout

```text
web-3d-panel-navigation/
|-- src/
|   |-- index.ts
|   |-- styles.scss
|   |-- types.ts
|   |-- easing.ts
|   |-- animation-timeline.ts
|   |-- zoom-plane-parser.ts
|   |-- css3d-renderer.ts
|   |-- projection.ts
|   |-- overview-camera.ts
|   |-- scene-graph.ts
|   |-- camera-controller.ts
|   |-- camera-transitions.ts
|   |-- clip-controller.ts
|   |-- url-hash-sync.ts
|   `-- zoom-navigation.ts
|-- example/
|   |-- index.html
|   |-- main.ts
|   `-- styles.scss
|-- docs/
|   `-- fifth-reference-attempt.md
|-- scripts/
|   |-- build.mjs
|   `-- build-example.mjs
|-- README.md
`-- package.json
```

### Public Entry Surface

The root package exports:

- `ZoomPlaneNavigator`
- `SceneGraph`
- `DEFAULT_CONFIG`
- Public types from `types.ts`

Internal modules are intentionally not re-exported as the public extension surface.

### Module Responsibilities

#### `types.ts`

Shared contracts and defaults.

| Export | Purpose |
|--------|---------|
| `ContainerRefs` | DOM references injected by the consumer — typically constructed via `resolveContainerRefs()` (in `container-refs.ts`), which locates the required convention IDs |
| `ZoomPlaneConfig` | Parsed configuration for a plane |
| `CameraState` | Camera position, target, and FOV |
| `NavigationConfig` | Runtime configuration options |
| `NavigationState` | State machine values |
| `NavigationEventType` | Public event names |
| `ScreenRect` | Viewport-relative inset rectangle |
| `DEFAULT_CONFIG` | Frozen defaults merged into runtime config |

#### `easing.ts`

Shared interpolation helpers.

| Export | Purpose |
|--------|---------|
| `easeInOutCubic(t)` | Primary easing curve |
| `lerp(a, b, t)` | Scalar interpolation |
| `remap(value, inMin, inMax, outMin, outMax)` | Phase remapping for timeline overlap |

#### `animation-timeline.ts`

Owns the single `requestAnimationFrame` loop used by navigation.

| Method | Purpose |
|--------|---------|
| `start()` | Start the persistent requestAnimationFrame loop |
| `stop()` | Cancel active sequences and stop the requestAnimationFrame loop |
| `subscribe(key, callback)` | Register a persistent per-frame callback such as scene rendering |
| `unsubscribe(key)` | Remove a persistent callback |
| `runSequence(duration, onTick)` | Run a timed sequence and cancel any previous active sequence |
| `hasActiveSequences()` | Report whether any timed sequences are currently active |

#### `zoom-plane-parser.ts`

Parses plane markup into `ZoomPlaneConfig` objects and validates the scene contract.

#### `css3d-renderer.ts`

Converts Three.js transforms into CSS `matrix3d()` values so DOM elements can exist as 3D surfaces.

#### `projection.ts`

Projects world-space geometry into viewport-space rectangles used by the clip-path reveal.

#### `scene-graph.ts`

Owns the Three.js scene, camera, CSS3D renderer, and the plane DOM objects.

| Method | Purpose |
|--------|---------|
| `render()` | Render the current scene state |
| `getPlaneConfigs()` | Return parsed plane configs |
| `getPlaneConfig(id)` | Return one plane config |
| `setPlaneOpacity(id, opacity)` | Update plane opacity during transitions |
| `destroy()` | Tear down the scene and renderer DOM subtree |

#### `overview-camera.ts`

Pure functions for overview framing math.

#### `camera-controller.ts`

Applies `CameraState` values and stores the current look-at target explicitly.

#### `camera-transitions.ts`

Adaptive camera motion logic.

| Export | Purpose |
|--------|---------|
| `applyTransition(from, to, rawProgress, camera)` | Apply the selected transition strategy |
| `calculateTransitionState(from, to, rawProgress)` | Return the selected transition state without mutating the camera; this is the path used by `ZoomPlaneNavigator` so `CameraController` can preserve its explicit look-at target |

#### `clip-controller.ts`

Manages content visibility classes, clip-path state, and content-container opacity.

| Method | Purpose |
|--------|---------|
| `hasSection(sectionId)` | Verify a target section exists |
| `setClipRect(rect)` | Update clip-path from a screen rect |
| `setOpacity(opacity)` | Update content-container opacity |
| `prepareForZoomIn(sectionId, rect)` | Set starting state for reveal |
| `completeZoomIn()` | Remove clip and enable scrolling |
| `prepareForZoomOut()` | Set starting state for conceal |
| `completeZoomOut()` | Reset containers and section visibility |

#### `url-hash-sync.ts`

Optional bidirectional sync between `location.hash` and the active panel.

| Method | Purpose |
|--------|---------|
| `reconcileInitial()` | On construction, snap directly into a section if the cold-load URL fragment matches a known `data-section` ID |
| `destroy()` | Remove the `hashchange` listener and unsubscribe from navigator events |

Behavior:

- Subscribes to `zoomStart` and `returnStart` and writes the URL via `history.pushState`.
- Listens for `hashchange` (covers back, forward, manual edits, and programmatic writes uniformly) and dispatches `zoomInto` / `returnToOverview`.
- Uses an internal reentrancy flag so navigator events fired in response to a hash change do not push the URL again.
- Mid-animation hash changes are deferred until the navigator lands in a terminal state, at which point a `stateChange` listener re-runs reconcile.

Disabled when `NavigationConfig.syncUrlHash` is `false`, in which case the navigator never instantiates this module.

#### `zoom-navigation.ts`

Main orchestrator.

Responsibilities:

- State machine management
- Plane click handling
- Escape and resize handling
- Overview recalculation
- Camera and clip sequencing
- Event emission
- Optional URL hash synchronization (delegated to `HashUrlSync`)
- Cleanup

### Dependency Shape

```text
zoom-navigation.ts
|-- scene-graph.ts
|   |-- css3d-renderer.ts
|   `-- zoom-plane-parser.ts
|-- camera-controller.ts
|-- camera-transitions.ts
|   `-- easing.ts
|-- clip-controller.ts
|   `-- projection.ts
|-- animation-timeline.ts
|-- overview-camera.ts
|   `-- projection.ts
|-- url-hash-sync.ts
`-- types.ts
```

---

## Public API

### Initialization

```ts
import { ZoomPlaneNavigator, resolveContainerRefs } from '@scupit/web-3d-panel-navigation';
import '@scupit/web-3d-panel-navigation/styles.css';

const zoomNav = new ZoomPlaneNavigator(
  resolveContainerRefs(),
  {
    cameraDuration: 1200,
    overlapRatio: 0.2,
  }
);
```

The constructor validates the parsed planes and ensures every `data-section` points at a real `.page-section` in the provided content container.

### Navigation Methods

#### `zoomInto(planeId: string): Promise<void>`

```ts
await zoomNav.zoomInto('left');
```

- Only valid from `overview`
- Resolves when the full zoom-in sequence completes

#### `returnToOverview(): Promise<void>`

```ts
await zoomNav.returnToOverview();
```

- Only valid from `section`
- Resolves when the full return sequence completes

#### `snapToSection(planeId: string): void`

```ts
zoomNav.snapToSection('small');
```

- Only valid from `overview`
- Synchronously enters the `section` state without playing the camera or clip animations
- Used internally by URL hash sync for cold-load deep links; available publicly for advanced consumers that need an instant transition

### State Properties

#### `state: NavigationState`

```ts
const state = zoomNav.state;
// 'overview' | 'zooming-in' | 'section' | 'zooming-out'
```

#### `activePlane: string | null`

```ts
const planeId = zoomNav.activePlane;
```

### Scene Access

#### `getPlaneConfigs(): ReadonlyArray<ZoomPlaneConfig>`

```ts
const configs = zoomNav.getPlaneConfigs();
```

#### `getPlaneConfig(id: string): ZoomPlaneConfig | undefined`

```ts
const config = zoomNav.getPlaneConfig('middle');
```

#### `getScene(): SceneGraph`

```ts
const scene = zoomNav.getScene();
console.log(scene.camera.position);
```

`SceneGraph` is exposed mainly for inspection and advanced integration, not as the primary extension point.

#### `recalculateOverview(): void`

Call this after dynamic scene changes that alter the effective plane layout.

### Event System

#### `on(event: NavigationEventType, handler): void`

```ts
zoomNav.on('stateChange', (state) => console.log('State:', state));
zoomNav.on('zoomStart', (planeId) => console.log('Zooming to:', planeId));
zoomNav.on('zoomComplete', (planeId) => console.log('Arrived at:', planeId));
zoomNav.on('returnStart', () => console.log('Returning...'));
zoomNav.on('returnComplete', () => console.log('Back to overview'));
```

#### `off(event: NavigationEventType, handler): void`

Removes a previously registered handler.

### Cleanup

#### `destroy(): void`

```ts
zoomNav.destroy();
```

`destroy()`:

- Cancels the active timeline
- Removes window listeners
- Removes plane click handlers
- Removes the optional back-button handler
- Tears down the CSS3D renderer subtree

---

## State Machine

```text
overview -> zooming-in -> section -> zooming-out -> overview
           ^                          |
           |-------- Escape ----------|
```

### Cancellation

Pressing Escape during zoom-in:

1. Cancels the active timeline sequence.
2. Resets clip and plane visibility state.
3. Starts a new return sequence from the camera's current state.
4. Returns to `overview` using the same transition logic in reverse.

---

## Content Philosophy

### Progressive Enhancement

The 3D navigation is a visual layer over normal HTML content, not a replacement for it.

### How Content Works

1. Sections remain present in the DOM as standard HTML.
2. `.page-section` elements are hidden by default.
3. The active section is shown by toggling `.active`.
4. The content container is revealed through an animated rectangular `clip-path`.
5. The content itself is never transformed in 3D.

### Benefits

| Benefit | Description |
|---------|-------------|
| SEO | Content remains present in the DOM |
| Accessibility | Content is still normal HTML for assistive technology |
| Performance | No duplicated content textures or canvas rendering |
| Readability | Text stays untransformed and crisp |

### Why No Content Transforms?

- Text anti-aliasing is better when content stays in normal document space.
- Untransformed content is easier to read.
- The perpendicular camera view removes the need for 3D-transformed content.
- The clip-path handoff is simpler and more robust than blending transformed HTML with viewport content.

---

## Configuration

### Default Configuration

```ts
const DEFAULT_CONFIG = {
  scale: 0.5,
  overviewFov: 50,
  detailFov: 50,
  fillPercentage: 0.8,
  cameraDuration: 1000,
  clipDuration: 400,
  overlapRatio: 0.15,
  overviewPadding: 0.15,
  syncUrlHash: true,
};
```

### Customizing Configuration

```ts
const zoomNav = new ZoomPlaneNavigator(refs, {
  cameraDuration: 1500,
  clipDuration: 600,
  fillPercentage: 0.9,
  overlapRatio: 0.2,
});
```

### Configuration Effects

| Setting | Effect of increasing |
|---------|----------------------|
| `scale` | Makes planes larger in world space |
| `overviewFov` | Widens overview framing and increases perspective distortion |
| `detailFov` | Widens the zoomed-in view |
| `fillPercentage` | Makes a plane fill more of the viewport when zoomed |
| `cameraDuration` | Slows camera motion |
| `clipDuration` | Slows reveal and conceal |
| `overlapRatio` | Starts the clip earlier during the camera tail |
| `overviewPadding` | Adds more space around the scene in overview |
| `syncUrlHash` | When true, mirrors the active panel into `location.hash` (using the panel's `data-section` ID) and reconciles state from the hash on load and on browser back/forward |

The runtime merges config once, freezes it, and shares that single reference across subsystems.

---

## CSS and Theming Contract

### Import the Package Stylesheet

The easiest and intended setup is:

```ts
import '@scupit/web-3d-panel-navigation/styles.css';
```

That stylesheet contains both:

- The crucial structural rules required for the navigation system to function
- The default look of the demo-style planes and sections

### Structural Selectors Used by the Shipped CSS

The shipped stylesheet assumes these selectors and state classes:

- `#zoom-planes-source`
- `#scene-container`
- `#page-content-container`
- `.page-section`
- `.zoom-plane`
- `.plane-label`
- `.back-button`
- `.hidden`
- `.fully-hidden`
- `.fully-visible`
- `.active`

Important nuance:

- The runtime operates on passed DOM references (`ContainerRefs`), but the four container IDs (`#scene-container`, `#page-content-container`, `#zoom-planes-source`, `#back-button`) are **required by the package**: both the stylesheet and `resolveContainerRefs()` rely on them.
- The remaining selectors (state classes, component classes) are also part of the contract and toggled by the runtime.
- If you replace the stylesheet wholesale, your replacement must preserve the same structural rules — IDs, state classes, and `.page-section` / `.zoom-plane` behaviors — for the runtime to keep working.

### What the Package Stylesheet Handles

Functional behavior supplied by the stylesheet includes:

- Hiding the plane source container
- Fixed-position fullscreen scene and content containers
- Scene fade-out and fully-hidden state
- Initial clip state for the content container
- Scroll enablement when content becomes fully visible
- Default hidden/active behavior for page sections
- Default plane appearance, hover state, and opacity transition
- Default back-button visibility behavior

### Theming Variables

The shipped stylesheet exposes CSS custom properties such as:

- `--w3dpn-font-family`
- `--w3dpn-page-background`
- `--w3dpn-text-color`
- `--w3dpn-heading-color`
- `--w3dpn-link-color`
- `--w3dpn-plane-background`
- `--w3dpn-plane-border-color`
- `--w3dpn-plane-border-hover-color`
- `--w3dpn-plane-label-color`
- `--w3dpn-surface-background`
- `--w3dpn-backdrop-background`
- `--w3dpn-backdrop-border`

In the current package phase, consumers should treat those variables as the main customization surface.

---

## Debugging and Inspection

The package does not automatically expose itself on `window`. If you want console access during local development, do it explicitly:

```ts
const zoomNav = new ZoomPlaneNavigator(refs);
(window as typeof window & { zoomNav?: ZoomPlaneNavigator }).zoomNav = zoomNav;
```

Useful console checks:

```ts
zoomNav.state
zoomNav.activePlane
zoomNav.zoomInto('left')
zoomNav.returnToOverview()
zoomNav.getPlaneConfigs()
zoomNav.getPlaneConfig('middle')
zoomNav.getScene().camera.position
zoomNav.on('stateChange', (s) => console.log('State:', s))
```

### Common Issues

| Issue | Likely Cause | What to Check |
|-------|--------------|---------------|
| Planes not visible | Missing stylesheet or wrong selectors | Confirm package stylesheet is imported and selectors match the contract |
| Clicks do nothing | Not in `overview` state | Check `zoomNav.state` |
| Initialization throws | Invalid plane attributes or missing section | Check `data-*` values and matching section IDs |
| Clip looks wrong | Consumer CSS overrides structural rules | Inspect `#page-content-container` and `.page-section` behavior |
| Overview framing looks off after scene changes | Overview not recalculated | Call `zoomNav.recalculateOverview()` |

---

## Future Directions

These are not current package guarantees, but they remain sensible follow-up areas:

- Container-scoped rendering instead of viewport ownership
- A more formal styling API beyond CSS variable theming
- Generated declaration files in published output
- More explicit public extension points for advanced integrations
- A mobile-oriented fallback strategy documented alongside the fullscreen system

---

## Key Terms and Glossary

| Term | Definition |
|------|------------|
| Zoom Plane | A rectangular 3D surface that can be clicked to zoom into a section |
| Perpendicular View | Camera position directly facing the plane so it appears axis-aligned on screen |
| Focal Element | A plane marked with `data-zoom-center` that anchors overview framing |
| Balanced Scene Mode | Overview framing mode centered on the scene as a whole |
| Screen Rect | Viewport-space inset rectangle used to drive the clip-path reveal |
| Clip-Path Reveal | The expanding or shrinking `clip-path: inset()` transition used for content handoff |
| Unified Timeline | One `requestAnimationFrame` loop that drives all animation phases |
| Phase Overlap | Starting clip reveal before camera movement has completely finished |
| Adaptive Transition | Camera transition selector that chooses Early Look or Orbit |
| Time-Reversal | Evaluating the zoom-in transition backward during zoom-out |
| CSS3D Transform | Using CSS `matrix3d()` to place real DOM nodes in 3D space |

---

## Summary

The fifth reference attempt is now a standalone package that preserves the tested behavior from the prototype site:

- Fullscreen viewport-owned navigation
- Declarative plane markup and normal HTML page content
- Adaptive camera motion with seamless 3D-to-2D handoff
- Shipped structural CSS and default styling with theme-variable overrides
- A decomposed runtime architecture with a small public API

For current implementation details, treat this document and the code under `web-3d-panel-navigation/src/` as canonical. Treat earlier attempt docs as historical design context.
