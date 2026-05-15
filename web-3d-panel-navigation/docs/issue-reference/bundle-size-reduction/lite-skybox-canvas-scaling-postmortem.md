# Lite Skybox Fullscreen Canvas Scaling Post-Mortem

## Summary

After the Phase 2 cutover from three.js to the in-house math/scene-graph layer
(see `phase-2-completion-handoff.md`), the lite starfield example
(`example/dist/lite-skybox.html`) rendered visibly different from the
three-backed equivalent (`example/dist/three-skybox.html`) at fullscreen. The
starfield appeared scaled up by exactly the device-pixel-ratio factor (1.5×
in the reproducing environment), with the rendered scene's center pushed
into the lower-right region of the visible viewport rather than viewport
center. The side-by-side parity harness (`example/dist/lite-compare.html`)
continued to look correct, so the lite renderer itself was not inherently
broken — only the fullscreen consumer case was affected.

The root cause was not in the math layer, the basis-vector extraction, the
projection shader, or the camera state plumbing. All of those were
byte-for-byte identical between the lite and three paths. The bug was that
the lite host's `<canvas>` element was being displayed at its intrinsic
backing-buffer size (`canvas.width × canvas.height` = 2880×1011 CSS pixels)
rather than stretched to the viewport (1920×674 CSS pixels). The visible
1920×674 region of the viewport therefore showed only the top-left
`1920/2880 ≈ 67%` × `674/1011 ≈ 67%` of the rendered scene, with everything
appearing at `1/0.67 ≈ 1.5×` its intended size — exactly the DPR factor.
On a DPR=1 display the bug would have been invisible; on a DPR=2 display
the zoom would have been 2×.

The fix was to add `width: 100%; height: 100%` to the default canvas style
in `src/skybox/lite/gl/context.ts`. This forces the canvas to render at the
viewport-sized CSS box regardless of its intrinsic dimensions, matching the
behavior `three.WebGLRenderer.setSize()` produces by explicitly assigning
`canvas.style.width`/`.style.height`.

After the fix, `lite-skybox.html` renders at the same scale as
`three-skybox.html`, all 77 tests pass, and the lite bundle stays in budget
(60 KB minified for the navigator + lite starfield entry).

## Affected Code

The bug and its fix were entirely contained within the lite skybox path
introduced in Phase 1. Files involved:

- `src/skybox/lite/gl/context.ts` — the actual fix (default canvas style)
  and the in-source comment that explains the dual-size-canvas /
  replaced-element root cause and references this postmortem
- `src/skybox/lite/lite-skybox-host.ts` — temporary diagnostic logging during
  investigation (since removed)
- `example/three-skybox.ts` — matching diagnostic logging during
  investigation (since removed)
- `example/lite-skybox.ts` — the reproducing setup; no changes needed
- `example/lite-compare.ts` — the parity harness that confirmed the
  rendering path itself was correct; no changes needed

No library API surface changed. No tests changed. No consumer code outside
the package's own example changed.

## Original Architecture

`LiteSkyboxHost` creates its own `<canvas>` element via `createLiteCanvas()`
in `gl/context.ts`. The original default style was:

```ts
const DEFAULT_CANVAS_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "0",
  right: "0",
  bottom: "0",
  zIndex: "0",
  pointerEvents: "none",
  display: "block",
};
```

The host then sized the canvas's backing buffer in `gl/resize.ts` (simplified
below; the real code wraps the assignments with `Math.max(1, ...)` floors and
an already-equal early-out, neither of which is load-bearing for this
explanation):

```ts
canvas.width = Math.floor(window.innerWidth * pixelRatio);
canvas.height = Math.floor(window.innerHeight * pixelRatio);
gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
```

The intent was that `position: fixed; inset: 0` would stretch the canvas to
the viewport, and the higher-resolution backing buffer would be scaled down
by the browser for crisp HiDPI output. This is the standard pattern for a
fullscreen non-replaced element such as a `<div>`.

The three-backed `SkyboxHost` does the same thing for its canvas style, but
additionally relies on `three.WebGLRenderer.setSize(width, height)` which
internally assigns:

```js
_canvas.style.width = width + 'px';
_canvas.style.height = height + 'px';
```

The lite host had no equivalent assignment because the default canvas style
was assumed sufficient.

## User-Visible Symptoms

After Phase 2 landed, running `npm run example:build` and opening the lite
example produced visibly different output between the two consumer paths:

- `example/dist/three-skybox.html` — full navigator with the three-backed
  starfield. Renders correctly. Stars are spread across the entire viewport
  at roughly the same density and apparent size as the parity harness.
- `example/dist/lite-skybox.html` — full navigator with the lite starfield.
  Stars appear visibly larger and more concentrated, as if the viewport were
  showing a cropped, magnified portion of a wider scene.
- `example/dist/lite-compare.html` — side-by-side three vs lite parity check
  with hand-built three.js cameras. Both panes render identically. No visual
  regression.

The combination of (lite-compare looks correct) and (lite-skybox does not)
ruled out the lite renderer being inherently wrong, and pointed at the
specific interaction between the lite renderer and the navigator-managed
fullscreen consumer setup.

The bug was only visible on HiDPI displays. The visible scaling factor
equaled `devicePixelRatio` exactly: at DPR=1 the canvas backing and the CSS
box would coincide and the symptom would vanish entirely; at DPR=1.5 (the
reproducing environment) the scene appeared 1.5× too large; at DPR=2 it
would appear 2× too large. A developer testing on a non-HiDPI external
monitor at 100% scaling could plausibly have missed the regression even
when explicitly looking for it.

This issue was tracked as Issue #2 in
`phase-2-completion-handoff.md` and was the gating concern before Phase 3
API generalization could begin.

## Investigation Process

The investigation produced a clear ruling-out chain before isolating the
cause. The chain itself is worth preserving because the same approach
generalizes to similar visual-correctness bugs.

### What was ruled out by static analysis

The first pass walked through the lite renderer end-to-end against the
three reference:

- The math layer (`src/math/*`) was already cross-validated against three in
  `math.test.ts` and `scene.test.ts`. No discrepancy possible there.
- The basis-vector extraction in `LiteSkyboxHost.updateFrame()` reads
  `camera.matrixWorld.elements` columns 0/1/2 with the standard
  back-basis-negated-as-forward convention. Equivalent to what three's
  `WebGLRenderer` reads internally.
- The lite starfield vertex shader's manual perspective construction
  (`vec4(vx / (aspect * tan), vy / tan, 0.0, max(-vz, 0.001))`) was traced
  algebraically against three's standard `projectionMatrix *
  modelViewMatrix * vec4(position, 1.0)` for stars in front of the camera.
  For our representative camera state (camera at `(0, 0, 2703.24)`, identity
  rotation, fov 50°, aspect 2.85), both produce identical clip-space
  coordinates.
- The `max(-vz, 0.001)` clamp for stars behind the camera was checked: any
  star behind the camera with non-trivial `vx` or `vy` produces
  `gl_Position` components outside the `[-w, w]` clip range and is culled
  by WebGL. No leaked rendering.
- Three's `group.position.copy(camera.position)` per-frame translation of
  the starfield group is mathematically equivalent to the lite shader's
  rotation-only basis math. The camera position cancels out of both
  formulations.

This static analysis was exhaustive enough to conclude that no math or
shader bug could produce the symptom — yet the symptom was real.

### Diagnostic instrumentation

Since static analysis ran dry, temporary `[LITE]` and `[THREE]` log blocks
were added to the first five frames of each path, in matched format:

- `LiteSkyboxHost.updateFrame()` was extended to log `fovY`, `aspect`,
  CSS/backing dimensions, camera position, camera rotation, the
  forward/right/up basis vectors, the length of each basis vector, and the
  three pairwise dot products of those basis vectors.
- `example/three-skybox.ts` got an identical block running right after
  `syncCamera()`, extracting the basis the same way from
  `skyCamera.matrixWorld.elements`.

The two log streams from the same DOM environment were diffed by hand. The
first round confirmed:

- All fov, aspect, position, rotation, and CSS/backing dimension fields
  matched to six decimal places.
- Both basis vectors had length 1.000000 and pairwise dots 0.000000 —
  perfectly orthonormal.
- The lite custom camera and the synced three camera produced byte-for-byte
  identical numerical state.

That result was the critical pivot. It ruled out every input-side hypothesis
(camera state divergence, math layer drift, FOV/aspect plumbing, basis
extraction). The bug had to live downstream of camera state — in GL state,
shader behavior, or canvas-element behavior.

### Canvas-dimension instrumentation

A second logging round was added: each log block now also reported
`canvas.width`/`.height` (backing), `canvas.style.width`/`.height` (CSS),
and `canvas.getBoundingClientRect()` (actually-rendered CSS dimensions).

This immediately exposed the asymmetry:

- Three canvas: `backing=(2880 x 1011) style=(1920px x 674px) rect=(1920 x 674)`
- Lite canvas:  `backing=(2880 x 1011) style=(auto x auto) rect=(2880 x 1011)`

The lite canvas was being rendered at its intrinsic backing-buffer size
(2880×1011 CSS pixels), not at the viewport size (1920×674). The "zoomed
in" appearance was the inevitable consequence: the visible portion of the
oversized canvas was the top-left 67%, and every rendered detail was
inflated by the DPR factor of 1.5.

## Root Cause

A `<canvas>` element has two independent sizes, both of which must be set
correctly for proper display:

1. **Backing-buffer size** (`canvas.width` × `canvas.height`) — the pixel
   grid WebGL draws into. The lite host correctly assigns this to
   `viewport × DPR` so output is crisp on HiDPI displays.
2. **CSS display size** (`canvas.style.width` × `.style.height`, or
   inferred from layout) — how large the canvas appears on the page. The
   browser scales the backing buffer to fit this box.

The two are deliberately decoupled to enable HiDPI rendering — you draw
into more pixels than you display, and the browser does the down-scale.
Both three.js and the lite renderer follow this pattern for the backing
buffer.

The decoupling, however, requires that something set the CSS display size
explicitly. The lite host had not been doing that. It relied on the
`position: fixed; top: 0; left: 0; right: 0; bottom: 0;` idiom to stretch
the canvas to the viewport, in the same way that idiom stretches a
`<div>`.

That idiom does not work reliably for `<canvas>` because **`<canvas>` is a
CSS replaced element**. Replaced elements (same category as `<img>`,
`<video>`, `<iframe>`) have *intrinsic dimensions* derived from their
content. For a `<canvas>`, the intrinsic size equals its backing buffer:
`canvas.width × canvas.height`. The CSS specification allows browsers to
fall back to those intrinsic dimensions when `width` and `height` are
`auto`, even when inset values are specified, and the reproducing browser
in this case did exactly that. Other browsers were not exhaustively tested
as part of this fix — the safe assumption is that without an explicit CSS
size, an over-constrained replaced element can land at its intrinsic
dimensions on any engine that honors the spec's replaced-element sizing
rules.

So the lite canvas with backing buffer 2880×1011 was being displayed at
2880×1011 CSS pixels regardless of `inset: 0`, overflowing the 1920×674
viewport. The user saw the top-left 1920×674 region of a canvas that was
1.5× too large.

The three-backed `SkyboxHost` never hit this because three's
`WebGLRenderer.setSize()` explicitly assigns both
`canvas.style.width = width + 'px'` and `canvas.style.height = height + 'px'`.
That explicit assignment overrides the intrinsic-dimension fallback and
forces the CSS display size to match the requested viewport size.

## Final Treatment

The fix was a single edit to `DEFAULT_CANVAS_STYLE` in
`src/skybox/lite/gl/context.ts`:

```ts
const DEFAULT_CANVAS_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "0",
  right: "0",
  bottom: "0",
  width: "100%",   // <-- new
  height: "100%",  // <-- new
  zIndex: "0",
  pointerEvents: "none",
  display: "block",
};
```

With `position: fixed`, the canvas's containing block is the viewport, so
`width: 100%` and `height: 100%` resolve to viewport dimensions. The
explicit width and height values override the intrinsic-dimension fallback,
guaranteeing the canvas is displayed at viewport size regardless of how
large the backing buffer is.

Equivalent approaches considered:

- `width: 100vw; height: 100vh` — works identically; viewport units instead
  of percentage. Chose `100%` for symmetry with the existing inset
  convention.
- Assigning `canvas.style.width`/`.height` in `resize.ts` after each
  resize, mirroring `three.WebGLRenderer.setSize()` exactly — would have
  worked but introduced ordering interactions with the existing
  `canvasStyle` consumer-override option, since `resize.ts` runs after
  `Object.assign(canvas.style, DEFAULT_CANVAS_STYLE, options.canvasStyle)`
  in the host constructor. The CSS-only default sidesteps this.

The chosen fix preserves the existing `canvasStyle` override semantics: if
a consumer passes `canvasStyle: { width: "50%" }` the override still wins
because it is applied after the default via `Object.assign`. The parity
harness `example/lite-compare.ts` continues to work without modification
because its post-construction `Object.assign(canvas.style, paneCanvasStyle)`
override (`position: absolute; width: 100%; height: 100%`) still wins on
top of the new defaults.

The fix carries an extended in-source comment explaining the dual-size
nature of `<canvas>`, the replaced-element CSS quirk, why three.js avoids
the problem, the visible symptom if the fix is reverted, and a direct
reference to this postmortem document. Code readers who encounter the
`width: 100%; height: 100%` lines should find enough context locally to
understand why they are non-removable, with the deeper history available
here.

## Verification

Library tests:

```text
npm test
```

Result:

```text
Test Suites: 5 passed, 5 total
Tests:       77 passed, 77 total
```

Library build:

```text
npm run build
```

Result: passed. `dist/index.js` and `dist/skybox-lite.js` produced.

Example build:

```text
npm run example:build
```

Result: passed. Bundle sizes are within ~2% of the pre-fix Phase 2
measurements captured in `phase-2-completion-handoff.md`:

| Artifact | Minified bytes | KB |
| --- | ---: | ---: |
| `main.js` | 46,332 | 45.2 |
| `lite-compare.js` | 529,384 | 517.0 |
| `three-skybox.js` | 553,849 | 540.9 |
| `lite-skybox.js` | 61,159 | 59.7 |

Manual visual verification was performed by the project owner by reloading
`example/dist/lite-skybox.html` after the fix and visually comparing it
against `example/dist/three-skybox.html`. The reported observations:

- `example/dist/lite-skybox.html` and `example/dist/three-skybox.html` now
  show starfields of the same apparent scale, density, and screen
  distribution.
- `example/dist/lite-compare.html` continues to render three vs lite
  identically side-by-side, including after window resize.
- `canvas.getBoundingClientRect()` on the lite canvas reports the viewport
  CSS dimensions (1920×674 in the test environment), no longer the
  backing-buffer dimensions.

The package currently has **no automated test coverage for canvas CSS
sizing.** A development-mode runtime assertion is listed in Future
Follow-Up as the most plausible next step toward closing that gap; until
that lands, regressions of this class would have to be caught by manual
visual inspection on a HiDPI display.

## Diagnostic Approach (For The Next Time)

For the next person hitting a "two implementations that should be visually
equivalent are not" bug, the approach that worked here was:

1. **First, instrument both paths to log identical inputs in identical
   format.** Same field names, same number formatting, same frame budget,
   on both sides. Diff by hand. If inputs match, the entire input-side
   hypothesis space is ruled out in one pass and the remaining search
   space is much smaller.
2. **Then narrow.** Once inputs match, the bug lives downstream. Add
   targeted log entries for each remaining hypothesis (GL state, canvas
   element behavior, shader output). One round per narrowed space; do
   not try to instrument everything at once.

This investigation took two log rounds. The first ruled out everything
upstream of the shaders (math, basis extraction, FOV, aspect, plumbing).
The second exposed the canvas-dimension asymmetry directly. Total
instrumentation: about 60 lines across two files, removed once the cause
was identified.

When static analysis says two paths should produce equivalent output but
the visual evidence says they do not, the difference is in something the
analysis did not look at — most commonly the *container* around the
renderer rather than the renderer itself. Time spent re-checking the math
or the shader is usually wasted once equivalence proofs already exist.

## Lessons Learned

A `<canvas>` element's backing buffer and CSS display size are two
independent properties, and both must be set. The standard fullscreen idiom
`position: fixed; inset: 0` does not work reliably for replaced elements
when `width`/`height` are `auto` — the browser may fall back to the
element's intrinsic dimensions instead. This is not a browser bug; it is
what the CSS specification permits.

Any library that creates its own `<canvas>` element for fullscreen WebGL or
2D rendering should set `canvas.style.width` and `canvas.style.height`
explicitly — either via static CSS values like `100%`/`100vw` or by
imperative assignment after every backing-buffer resize. The three.js
`WebGLRenderer` chose the latter; the lite renderer now does the former.
Both are valid; the cost of doing neither is silent visual scaling that
looks like a shader or math bug at first glance.

For projects that maintain parallel renderer backends (here: a three-backed
host and a custom WebGL host), the parity harness should run both backends
in a fullscreen configuration in addition to a windowed split-pane
configuration. The existing `lite-compare.html` parity harness rendered
both backends in half-pane containers with explicit `width: 100%` and
`height: 100%` overrides, which masked exactly this class of canvas-sizing
issue. A `fullscreen-compare.html` variant could have caught the bug
during Phase 1 instead of during Phase 2 integration.

Mathematical equivalence between two rendering paths does not imply visual
equivalence. The lite starfield shader was algebraically correct, but the
canvas it drew into was misconfigured. A bug can live entirely in the
container around the renderer rather than in the renderer itself.

Diffing instrumented log streams is the right tool when two paths produce
different visual output despite "should be equivalent" reasoning. The cost
of adding ~30 lines of log code per side temporarily is low; the certainty
it produces is high.

## Future Follow-Up

### Fullscreen Parity Harness

Add an `example/fullscreen-compare.html` page that mounts the three-backed
and lite-backed skyboxes as overlapping fullscreen layers (or in
alternating frames) without a parent container or pane-scoped styles.
That harness would have detected this canvas-sizing issue during Phase 1.
Until that exists, fullscreen-specific consumer pages remain part of the
manual verification loop.

### Canvas-Size Sanity Assertion

Consider adding a development-mode assertion in `LiteSkyboxHost` that
compares `canvas.getBoundingClientRect()` against
`canvas.width / pixelRatio` shortly after first render and warns if the
ratio is far from 1. This would catch future regressions of the same
class — for example, a consumer who passes a `canvasStyle` that
inadvertently strips the default `width: 100%`.

### Phase 3 API Generalization

Issue #1 from `phase-2-completion-handoff.md` (the awkward asymmetry
between the lite and three host APIs for navigator-owned cameras) is now
unblocked. The handoff explicitly recommended resolving Issue #2 before
designing the unified Phase 3 API, and that condition is now met.

### Other Replaced-Element Layers

The CSS3D renderer also adds DOM elements to the page, but those are not
replaced elements and are not affected by this issue. The legacy
three-backed `SkyboxHost` uses three's `WebGLRenderer`, which handles the
CSS display size internally and is not affected. No other surface in the
package needs the same fix.

## Current Status

The fix has landed. `example/dist/lite-skybox.html` renders at the correct
visual scale, matching the three-backed equivalent. All 77 tests pass.
Bundle sizes are within ~2% of pre-fix measurements. The temporary
diagnostic logging has been removed. The in-source comment at the fix site
captures the rationale and references this postmortem document.

Issue #2 from `phase-2-completion-handoff.md` is resolved. Issue #1 (the
asymmetry between the lite and three host APIs around navigator-owned
cameras) remains open and was always scoped for Phase 3 rather than
Phase 2 — resolving Issue #2 does not change Issue #1's status, but it
does unblock Phase 3 API design work, which had been gated on having a
correctly-rendering lite renderer to design against.
