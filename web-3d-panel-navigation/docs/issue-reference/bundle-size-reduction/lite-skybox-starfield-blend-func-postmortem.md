# Lite Starfield Additive Blend-Function Post-Mortem

## Summary

After Phase 2 of the bundle-size reduction effort (see
`phase-2-completion-handoff.md`) and the subsequent canvas-scaling fix (see
`lite-skybox-canvas-scaling-postmortem.md`), the lite starfield renderer was
geometrically and dimensionally at parity with the three-backed renderer:
both projected the same stars to the same on-screen positions, at the same
size, in the same camera state. One residual cosmetic disparity remained.
The "stars" in `example/dist/lite-skybox.html` read as flat bright dots,
while the same star data rendered through `example/dist/three-skybox.html`
read as soft-edged twinkling stars — the kind of difference between an
experienced designer who knows how to dress a dot up as a star, and a
beginner who draws the dot literally.

The root cause was not in the shaders, the projection math, the camera
state, the canvas sizing, or the per-vertex `gl_PointSize`. The bug was a
single GL-state choice around the draw call: the lite starfield pass ran
`gl.blendFunc(gl.ONE, gl.ONE)`, while three's `ShaderMaterial` +
`AdditiveBlending` configuration actually runs
`gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE)`. With identical
fragment output of `vec4(color * intensity, intensity)`, those two blend
configurations produce visibly different final pixels:

- Lite (broken): `final.rgb = color * intensity + dst.rgb`
- Three (correct): `final.rgb = color * intensity² + dst.rgb`

Because `intensity = brightness * twinkle * falloff` is the product of three
values each ≤ 1, the missing square term silently inflated edge pixels,
twinkle troughs, and dim stars. The eye reads the linear-`intensity` curve
as a uniform population of bright dots and the squared-`intensity` curve as
soft-haloed stars that fade in and out — the visual illusion that
distinguishes "stars" from "dots."

The fix was a one-line change in `src/skybox/lite/passes/starfield-pass.ts`:
`gl.blendFunc(gl.ONE, gl.ONE)` →
`gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE)`. No shader,
geometry, projection, camera, or canvas change. After the fix,
`lite-skybox.html` and `three-skybox.html` look identical to the eye in the
navigator's full-page overview state. All 77 tests still pass; the lite
bundle gains 53 bytes from the longer GL call (`blendFuncSeparate` and 4
arguments vs `blendFunc` and 2). No Phase 2 budget threshold is crossed.

## Affected Code

The bug and its fix were entirely contained in one file. Files involved:

- `src/skybox/lite/passes/starfield-pass.ts` — the actual fix (one-line GL
  state change) and an in-source comment block explaining why the
  `gl.blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)` form is non-removable
  and references this postmortem. No other code in the file changed.
- `docs/issue-reference/bundle-size-reduction/implementation-handoff.md`
  (line 228) — the original specification incorrectly prescribed
  `gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE)` "to match three
  when `premultipliedAlpha: true`." That prose conflated two distinct
  `premultipliedAlpha` concepts (canvas context vs. material) and produced
  the wrong recipe; the lite implementation faithfully followed it. The
  document is left as-is for historical accuracy; this postmortem is the
  erratum.

No public API surface changed. No tests changed. No shader source changed.
Bundle size grew by 53 bytes (essentially the longer GL call;
see Verification for the breakdown); no Phase 2 budget threshold was
crossed. The library's three-backed path (`src/skybox/starfield-skybox.ts`)
was not touched and is the visual reference the fix matches.

## Original Architecture

The lite starfield pass and the three-backed starfield perform the same
high-level work in different ways. They share fragment-shader math
verbatim, and they were always intended to share visible output.

### Three-backed starfield

Defined in `src/skybox/starfield-skybox.ts`. A `Points` object whose
material is a `ShaderMaterial` configured as:

```ts
new ShaderMaterial({
  vertexShader: STARFIELD_VERTEX_SHADER,
  fragmentShader: STARFIELD_FRAGMENT_SHADER,
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
  uniforms: { /* warm/cool, time, twinkle freq, base size, pixel ratio */ },
});
```

The fragment shader writes:

```glsl
gl_FragColor = vec4(color * intensity, intensity);
```

where `intensity = vBrightness * twinkle * falloff` and each factor is
between 0 and 1.

When this material is rendered, three's `WebGLState.setBlending` (in
`node_modules/three/src/renderers/webgl/WebGLState.js`) translates
`AdditiveBlending` into a concrete `gl.blendFunc*` call. Critically, that
translation branches on `material.premultipliedAlpha`. `Material` defaults
that flag to `false` (`Material.js:415`), and `ShaderMaterial` does not
override it.

### Lite starfield pass

Defined in `src/skybox/lite/passes/starfield-pass.ts`. The fragment writes:

```glsl
outColor = vec4(linear, intensity);
```

where `linear = mix(uColorWarm, uColorCool, vTint) * intensity` and
`intensity = vBrightness * twinkle * falloff`. The shader output is
therefore identical in value to the three fragment's
`vec4(color * intensity, intensity)`. The render call does its own
GL-state setup directly:

```ts
gl.disable(gl.DEPTH_TEST);
gl.enable(gl.BLEND);
gl.blendEquation(gl.FUNC_ADD);
gl.blendFunc(gl.ONE, gl.ONE);                 // <-- the bug
gl.drawArrays(gl.POINTS, 0, starCount);
gl.disable(gl.BLEND);
```

This GL-state recipe was prescribed verbatim by Phase 1's
`implementation-handoff.md` line 228, which said the
`gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE)` (equivalent to
`gl.blendFunc(gl.ONE, gl.ONE)` for our case since the source alpha factor
ends up unused) form matches three "when `premultipliedAlpha: true`" on the
canvas context.

### The two `premultipliedAlpha` flags are not the same flag

The conflation that produced this bug deserves to be stated directly,
because it sits at the center of every part of the diagnosis:

1. **Canvas-context `premultipliedAlpha`** (passed to
   `canvas.getContext('webgl2', { premultipliedAlpha: true })`) controls
   how the WebGL canvas as a whole composites against the surrounding page
   DOM. It tells the browser whether the framebuffer's RGB values are
   already multiplied by alpha when the page composites the canvas against
   underlying HTML. It does not affect anything that happens *inside* the
   GL context.
2. **Material `premultipliedAlpha`** (a property on three's `Material`)
   controls how three's renderer interprets the fragment shader's output
   when selecting blend factors for the framebuffer blend. It tells three
   "the shader output's RGB is/isn't already multiplied by alpha," and
   three picks `gl.blendFunc*` accordingly.

These flags are independent. They can be set independently. Three's
`WebGLState.setBlending` reads only the material flag when picking blend
factors; the context flag is irrelevant to that decision. The
implementation-handoff prose conflated the two and produced a recipe that
was correct for "material-`premultipliedAlpha`-`true`" while the relevant
default is "material-`premultipliedAlpha`-`false`."

## User-Visible Symptoms

The phenomenology was easy to describe and hard to pin down. Both pages
used the same navigator with the same camera, the same overview state, the
same star count, the same star data layout, and (after the canvas-scaling
fix) the same on-screen geometry. Yet:

- `example/dist/three-skybox.html` rendered a starfield with the visual
  characteristics one expects from "stars": dim background sparkle,
  brighter foreground stars with a soft halo around the bright core, and a
  visible twinkle that took individual stars all the way down toward zero
  brightness on the trough of the sine wave before bringing them back.
- `example/dist/lite-skybox.html` rendered a starfield with the visual
  characteristics of a flat dot field: every star at a high brightness
  floor, edges that fade only weakly into the background rather than the
  soft halo three produces, and a twinkle that was technically present
  but read as "all stars dim slightly in unison" rather than "individual
  stars fade out and back in."

The project owner's framing — paraphrased: "the difference between an
experienced designer using styling to its fullest to give dots the
illusion of being stars, and a beginner who has the idea but can't bring
out the illusion" — was an unusually accurate summary of the underlying
math, before that math was understood. The "illusion" of starlight is
exactly the non-linear falloff produced by squared `intensity`; the
"beginner version" is exactly the linear `intensity` that the lite path
was producing.

The bug was not visible in the side-by-side parity harness
(`example/dist/lite-compare.html`). That harness runs both backends in
half-pane containers with a hand-built three.js camera at fov 60, with a
single `PerspectiveCamera` shared between the two panes
(`example/lite-compare.ts:67`). The disparity becomes obvious only in the
navigator's full-page overview state, where each backend renders alone in
the full viewport at fov 50 against the consumer-page chrome — exactly
the configuration `lite-skybox.html` and `three-skybox.html` use, which
`lite-compare.html` does not. The detailed mechanism is in the
`Root Cause` section below.

This is the second residual issue from `phase-2-completion-handoff.md`'s
Issue #2 ("Lite starfield looks zoomed in at fullscreen"). The first
component of that issue — the canvas being displayed at its intrinsic
backing-buffer size — was resolved by the canvas-scaling fix and its
postmortem. The remaining "stars look brighter / less twinkly" component
is what this postmortem covers.

Severity is cosmetic. The lite renderer was fully functional; the bug
reduced visual polish but did not break any consumer's use of the library.
The reason it is worth a postmortem anyway is that the underlying
conceptual error (conflating the two `premultipliedAlpha` flags) is the
kind that will recur in any future lite pass that tries to mirror a
three-side blend recipe. Documenting it here means the next contributor
adding a lite material does not have to re-derive it.

## Investigation Process

This investigation took one round of careful reading and one source-level
verification, in part because the prior canvas-scaling postmortem had
already trained the right diagnostic instinct: when two paths look
visually different despite "should be equivalent" reasoning, look at the
*container* around the renderer, not the renderer itself. In the
canvas-scaling case, the container was the `<canvas>` element. Here, the
container is the GL state machine immediately around the draw call.

### What the user's hunch suggested

The opening hypothesis was that the lite path might be drawing at a
smaller internal resolution than three, so identical `gl_PointSize` values
would cover proportionally more of the visible image and read as larger
stars. Equivalently, the `uBaseSize` or `uPixelRatio` uniforms might be
different between the two paths. This was a reasonable hypothesis and the
right first thing to check.

### Shader-output equivalence check

Reading the two shaders side-by-side ruled the hunch out quickly:

- Per-vertex point size: both paths compute
  `gl_PointSize = uBaseSize * aBrightness * uPixelRatio`. `uBaseSize` is
  3.5 by default in both renderers (`DEFAULT_BASE_SIZE` in
  `starfield-skybox.ts:21` and `factories/starfield-skybox.ts:23`).
  `uPixelRatio` is supplied by the host on each side from the same DPR
  source (`Math.min(window.devicePixelRatio, 1.5)`). `aBrightness` comes
  from the per-star buffer; the buffer *contents* are equivalent and
  generated by analogous `Math.random()` distributions, even though the
  memory layout differs (three uses four separate `BufferAttribute`s
  while lite uses one interleaved buffer at `FLOATS_PER_VERTEX = 6`).
  The data values that feed the shader are the same.
- Per-fragment intensity: both paths compute
  `intensity = brightness * twinkle * falloff` with identical `falloff`
  (`smoothstep(0.5, 0.1, length(centered))`) and identical `twinkle`
  (`0.7 + 0.3 * sin(uTime * uTwinkleFreq + vPhase)`).
- Final fragment value: both paths write
  `vec4(color * intensity, intensity)`. Three writes through
  `gl_FragColor`; lite writes through `outColor` (GLSL ES 3.00). Same
  value.

So the lite shader output and three's shader output are equivalent. The
canvas backing dimensions and CSS dimensions had already been confirmed
equivalent by the canvas-scaling postmortem's instrumentation. The hunch
about resolution / point size was ruled out, and the search space narrowed
to "GL state immediately around the draw call."

### GL-state diff

Reading the lite render block:

```ts
gl.disable(gl.DEPTH_TEST);
gl.enable(gl.BLEND);
gl.blendEquation(gl.FUNC_ADD);
gl.blendFunc(gl.ONE, gl.ONE);
gl.drawArrays(gl.POINTS, 0, starCount);
```

Reading the three-side material configuration: `transparent: true`,
`depthWrite: false`, `depthTest: false`, `blending: AdditiveBlending`. The
high-level configuration matches in spirit. The interesting question is:
what concrete `gl.blendFunc*` does three actually emit when it sees
`AdditiveBlending` on a material with `premultipliedAlpha = false`?

### Three-source verification

Read `node_modules/three/src/renderers/webgl/WebGLState.js` directly. The
relevant block is around lines 654–704:

```js
if ( premultipliedAlpha ) {
  switch ( blending ) {
    case AdditiveBlending:
      gl.blendFunc( gl.ONE, gl.ONE );
      break;
    // ...
  }
} else {
  switch ( blending ) {
    case AdditiveBlending:
      gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE );
      break;
    // ...
  }
}
```

The `premultipliedAlpha` referred to here is the *material* flag (the
third argument to `setBlending`, sourced from `material.premultipliedAlpha`
by `WebGLMaterials`). Reading `node_modules/three/src/materials/Material.js`
confirms the default:

```js
this.premultipliedAlpha = false;
```

`ShaderMaterial` extends `Material` without overriding that field. So the
legacy starfield material runs the *non-premultiplied* branch, and three
emits:

```js
gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE );
```

That is concretely different from the lite path's
`gl.blendFunc( gl.ONE, gl.ONE )` for the *source RGB* factor: lite multiplies
the source RGB by `gl.ONE`, three multiplies the source RGB by
`gl.SRC_ALPHA` — that is, by the alpha component of the same fragment.

Once that line was on screen, the bug was diagnosed. The implementation-
handoff's prescription (`(ONE, ONE, ONE, ONE)`) was the correct formula for
the *premultipliedAlpha-true* branch, and the lite implementation followed
that prescription exactly. But three's actual default is the
*premultipliedAlpha-false* branch, so matching three required the other
formula.

### Why this round was so short

Two factors compressed the diagnosis:

1. The canvas-scaling postmortem had already instrumented the input side
   of both renderers (camera, fov, aspect, basis vectors, canvas
   dimensions) and proved input equivalence. That work did not have to be
   redone.
2. The conceptual lesson from the canvas-scaling postmortem — "when math
   and inputs match but visuals don't, look at the container around the
   renderer" — translated directly. Here the relevant container was the
   GL state machine, specifically blend state. The translation took one
   reading of the lite render block and one source-level read of three's
   `WebGLState.setBlending`.

The bug had been present since the lite renderer was first written in
Phase 1; what was missing until this session was the side-by-side full-page
visual comparison in the navigator's overview camera state. The earlier
parity harness did not surface it because it ran in a half-pane,
shared-camera configuration that pulled the disparity below the eye's
threshold (see "Why `lite-compare.html` did not catch the bug" below).

## Root Cause

The fragment shaders in both renderers write the same value:

```text
src.rgb = color * intensity
src.a   = intensity
```

with `intensity ∈ [0, 1]`. The framebuffer blend equation is `FUNC_ADD` on
both sides, so:

```text
final.rgb = srcFactor.rgb * src.rgb + dstFactor.rgb * dst.rgb
```

The two paths supply different `srcFactor.rgb`:

- Lite: `srcFactor.rgb = ONE`, so
  `final.rgb = (color * intensity) + dst.rgb`
- Three: `srcFactor.rgb = SRC_ALPHA = intensity`, so
  `final.rgb = intensity * (color * intensity) + dst.rgb = (color * intensity²) + dst.rgb`

The destination factor is `ONE` on both sides; the difference lives
entirely in the source RGB factor.

### Why intensity² produces the "starlight" illusion and intensity does not

The shader-side `intensity` is a product of three sub-1 terms:

```text
intensity = brightness * twinkle * falloff
brightness ∈ [0.5, 1.0]   per-star, fixed at construction
twinkle    ∈ [0.4, 1.0]   per-frame sine in [0.7 - 0.3, 0.7 + 0.3]
falloff    ∈ [0.0, 1.0]   per-fragment, smoothstep on point-coord radius
```

Squaring a product of sub-1 terms compresses small values much harder than
large ones, in a way that maps closely onto how the human visual system
separates "starlight" from "uniform glow":

- **Falloff (`smoothstep(0.5, 0.1, r)`)** drops to 0 over the outer ~80%
  of each point's radius. With linear `intensity`, the outer ring of every
  point is still meaningfully bright — every star looks like a hard disc
  with a thin soft fade. With `intensity²`, that outer ring squares to
  near zero, leaving a small bright core surrounded by a quickly-fading
  halo. That is what the eye reads as "a star."
- **Twinkle troughs** (`twinkle ≈ 0.4` at the bottom of the sine) reduce
  every fragment's intensity to 40%. With linear intensity, that's still
  a clearly visible star — twinkle reads as "all stars dim slightly in
  unison." With squared intensity, the same trough reduces brightness to
  16% of the peak, which is well below the threshold where individual
  stars register against the background gradient — so they fade out and
  back in, and the twinkle reads as individual stars rather than a global
  dimming.
- **Dim stars** (`brightness ≈ 0.5`) carry a permanent factor of 0.5 into
  every fragment. With linear intensity, those dim stars still produce
  meaningfully bright pixels. With squared intensity, they sit closer to
  the noise floor, which is exactly the "background sparkle" layer that
  separates a populated starfield from a scattering of bright dots.

All three of these effects are present in the original three-backed
starfield because three runs the `SRC_ALPHA, ONE, ONE, ONE` blend. They
were *all* missing from the lite renderer because lite ran the
`ONE, ONE, ONE, ONE` blend. The cumulative effect is exactly what the
project owner's framing described: a competent image of stars vs. a
competent image of dots.

### Why the implementation-handoff prescription was wrong

The Phase 1 implementation handoff (`implementation-handoff.md:228`)
specified:

> Additive blending: `gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
> gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);` paired with
> `premultipliedAlpha: true` on the canvas context. This is the
> combination three uses when its renderer is configured with
> `premultipliedAlpha: true` (the default, inherited by the existing
> `SkyboxHost`).

Two errors compounded:

1. **Wrong flag.** The "default" referenced is the canvas-context flag
   (`canvas.getContext('webgl2', { premultipliedAlpha: true })`), which
   *is* indeed how three's `WebGLRenderer` configures its canvas. But
   three's blend-func selection is driven by `material.premultipliedAlpha`,
   not by the canvas-context flag. Those are independent flags governing
   independent stages of the pipeline. The handoff prose collapsed them
   into one concept.
2. **Wrong branch.** Even granting that the document meant "the
   `premultipliedAlpha: true` branch in three's renderer," the legacy
   starfield's `ShaderMaterial` does not set `premultipliedAlpha: true`.
   `Material` defaults the flag to `false`, and `ShaderMaterial` does not
   override it. So three's renderer, when rendering this specific
   material, takes the *false* branch — `SRC_ALPHA, ONE, ONE, ONE` — not
   the *true* branch.

The lite implementation followed the handoff exactly, so it inherited both
errors. The disparity itself was observed and tracked from the start of
Phase 2 (Issue #2 in `phase-2-completion-handoff.md` describes the
"zoomed in" appearance of `lite-skybox.html` relative to
`three-skybox.html`); what was missing until this session was the root
cause. The canvas-scaling postmortem closed the geometric component of
that observation, leaving the brightness-curve component as the residual
that this postmortem covers.

### Why `lite-compare.html` did not catch the bug

The bug is per-pixel: at every fragment the lite path produces
`color * intensity` and three produces `color * intensity²`. Per-pixel
disparity is the same regardless of viewport, fov, or aspect, and
`gl_PointSize` is in absolute pixels so per-star screen area is the same
in both configurations. What differs between the harness and the
consumer-facing fullscreen page is the total number of star pixels on
screen and, more importantly, the perceptual setup the eye uses to
compare them.

Two factors pulled the harness's apparent disparity well below the
threshold of casual visual inspection:

- **Half-pane viewport, fewer total pixels.** The harness renders each
  pane with `camera.aspect = (window.innerWidth / 2) / window.innerHeight`
  (`example/lite-compare.ts:126`). On a typical 1920×674 fullscreen
  (the test environment used in the canvas-scaling postmortem), the
  pane is 960×674 — half the pixel count of the consumer's fullscreen
  canvas (1920×674). The aspect/fov combination
  (harness fov 60 / aspect ~1.42 vs consumer fov 50 / aspect ~2.85) also
  shifts the visible solid angle of the star sphere modestly, but the
  dominant effect is simply "the harness has half the pixels for the bug
  to manifest in," which proportionally halves the total brightness
  disparity the eye integrates per frame.
- **Both panes share one `PerspectiveCamera` instance.** The harness
  builds a single `THREE.PerspectiveCamera` and feeds it to both the
  three host and the lite host (`lite-compare.ts:67–71`). The two panes
  therefore render the same scene from the same camera at the same
  instant, and the eye anchors on "do these two panes match each other"
  rather than "do these panes match a known-correct reference." A
  per-pixel disparity that is subtle but real reads as *equivalence* in
  side-by-side comparison; the same disparity, viewed alone in
  fullscreen with no twin reference and against a conscious mental
  model of what stars should look like, reads as *wrong*.

The second factor is the more important one. Even if the harness ran at
fullscreen aspect, having both panes driven by the same camera would
have the eye certifying "these match" rather than "these are correct."

This is a parity-harness coverage problem, not a renderer problem. The
harness already does compare lite against three — that part is fine —
but it does so in a configuration (fov 60, aspect ~1.42, half-pane,
shared camera) where the per-pixel disparity is below the threshold the
eye picks up in side-by-side. The `Future Follow-Up` section discusses
a possible fullscreen-overview parity configuration that would have
caught this earlier.

## Final Treatment

The fix is a single GL-state change in
`src/skybox/lite/passes/starfield-pass.ts`:

```ts
// before
gl.blendFunc(gl.ONE, gl.ONE);

// after
gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
```

The signature change from `blendFunc` to `blendFuncSeparate` is needed
because three uses different factors for the RGB and alpha channels of the
source: `SRC_ALPHA` for RGB, `ONE` for alpha. `blendFunc` would force both
channels to use the same source factor.

### Why this form, not the algebraic alternative

Two equivalent fixes exist:

- **Option A (chosen):** change the blend state to
  `gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE)`, leaving
  the shader unchanged.
- **Option B (rejected):** keep `gl.blendFunc(gl.ONE, gl.ONE)` and
  pre-multiply intensity into the shader output:
  `outColor = vec4(linear * intensity, intensity)`. With source factor
  `ONE` and pre-multiplied source RGB, the final-pixel formula reduces to
  the same `color * intensity² + dst.rgb`.

Option A was chosen for three reasons:

1. **Byte-for-byte parity with three.** The lite pass now emits the same
   `gl.blendFuncSeparate` arguments three's `WebGLState` emits for the
   same material. A future contributor grepping for `blendFunc` in either
   codebase will find the same configuration on both sides, with no
   indirection through the shader.
2. **Consistent meaning of "premultiplied."** Option B would make the
   lite shader's output "premultiplied" in the same sense as
   `material.premultipliedAlpha = true` on a three material, but the
   blend recipe would still match the `false` branch. That mixed labelling
   is exactly the conceptual error this postmortem is trying not to
   propagate.
3. **Shader stays minimal.** The lite shader is meant to read as a
   straightforward "this is what each fragment is worth" computation. Any
   future material-level work — fading the whole starfield, mixing in a
   second pass, etc. — can be reasoned about against three's
   `ShaderMaterial` defaults without an extra premultiply step in the way.

### In-source comment

The fix carries an extended comment block in
`starfield-pass.ts` explaining why the form is non-removable, summarizing
the pixel-level math, citing three's `WebGLState.js` as the source of
truth, and pointing here for the full history. The pattern follows the
canvas-scaling postmortem's convention: the in-source comment captures
enough context to dissuade a casual "simplification" pass from reverting
to `blendFunc(ONE, ONE)`, with the deeper history available in this
document.

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

Bundle measurements:

```text
node ./scripts/measure-bundles.mjs
```

Result: passed. All Phase 2 size budgets and content assertions hold.

| Entry | Pre-fix | Post-fix | Δ |
| --- | ---: | ---: | ---: |
| `ZoomPlaneNavigator` only | 45,528 B | 45,528 B | 0 |
| `ZoomPlaneNavigator` + lite gradient | 55,883 B | 55,883 B | 0 |
| `ZoomPlaneNavigator` + lite starfield | 60,207 B | 60,260 B | +53 |
| Lite gradient only | 10,305 B | 10,305 B | 0 |
| Lite starfield only | 14,604 B | 14,657 B | +53 |

The 53-byte delta is essentially attributable to the longer GL call, not
to the inline comment. `gl.blendFunc(gl.ONE, gl.ONE)` minifies to ~27
characters; `gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE)`
minifies to ~55 — a ~28-byte raw delta at the call site, with the
remaining ~25 bytes absorbed by minifier-internal effects (identifier
mangling, layout reflow). The inline comment block in `starfield-pass.ts`
grew by ~17 source lines but contributes 0 bytes to the minified output;
esbuild strips standard `//` comments during bundle minification (the
`measure-bundles.mjs` script runs `esbuild.build({ minify: true })`),
which was confirmed by inspecting the bundled output for the comment text.

Example build:

```text
npm run example:build
```

Result: passed. `example/dist/lite-skybox.html` and
`example/dist/three-skybox.html` rebuilt for visual comparison.

Manual visual verification was performed by the project owner after the
fix. Reported observations:

- `example/dist/lite-skybox.html` and `example/dist/three-skybox.html`
  now look identical to the eye: same apparent star count, same apparent
  brightness distribution, same twinkle behavior including the dark
  troughs that fade individual stars out and back in, same soft-edged
  halo around bright cores.
- `example/dist/lite-compare.html` continues to render its parity panes
  identically. The fix does not regress the harness; the harness simply
  did not exercise the failure mode in the first place.

There is no automated visual-regression test for starfield brightness
behavior. The `Future Follow-Up` section discusses one possible direction
for adding coverage of this class of bug.

## Diagnostic Approach (For The Next Time)

This investigation was short specifically because the canvas-scaling
postmortem had already established the right diagnostic stance. The
generalization that worked here, building on the canvas-scaling lesson:

1. **When two paths produce different visual output despite "should be
   equivalent" reasoning, the difference lives somewhere downstream of
   the equivalence proof.** That is the canvas-scaling postmortem's
   lesson, and it applies recursively. The "equivalence proof" tells you
   what *cannot* be the bug; the search space is everything else.
2. **For WebGL parity work, the search space splits into three
   neighborhoods:** (a) inputs to the shader (uniforms, attributes,
   per-frame state), (b) the shader itself, and (c) GL state immediately
   around the draw call (blend, depth, stencil, scissor, viewport,
   bound program, bound VAO). When (a) and (b) match, the disparity is
   in (c).
3. **High-level renderers like three.js translate semantic blending
   modes (`AdditiveBlending`, `NormalBlending`, etc.) into concrete
   `gl.blendFunc*` calls through branching logic.** The branches read
   material flags, especially `material.premultipliedAlpha`. When porting
   a three material to a hand-written WebGL pass, the only reliable
   reference is `node_modules/three/src/renderers/webgl/WebGLState.js`.
   Prose summaries of three's behavior are unreliable; this postmortem
   exists in part because of one such summary.
4. **Distinguish the canvas-context `premultipliedAlpha` from the
   material `premultipliedAlpha`.** They are independent flags that
   govern independent stages of the pipeline. The canvas-context flag
   controls how the WebGL canvas composites against page DOM. The
   material flag controls how the shader's fragment output is interpreted
   by `WebGLState.setBlending` when picking blend factors. Confusing the
   two will produce silently-wrong blend recipes.

The diagnosis took one round of focused reading once the canvas-scaling
fix had landed. The bulk of the effort spent on the overall "lite skybox
looks wrong" investigation was the canvas-scaling half. The lesson about
*where to look* generalized cleanly from one to the other.

## Lessons Learned

Three's `AdditiveBlending` is not a single GL-state recipe. It branches
on `material.premultipliedAlpha`, and the branches emit visibly different
final pixels. Anyone writing a hand-rolled WebGL pass to match a three
material must implement the right branch — typically the
`premultipliedAlpha = false` branch, since `Material` defaults the flag
to `false` and most materials inherit that default.

The canvas-context `premultipliedAlpha` and material `premultipliedAlpha`
are independent flags. They govern independent stages of the pipeline.
Future ports should specifically separate "how does the canvas composite
against the surrounding page DOM" (context flag) from "how does the
shader output blend against the framebuffer" (material flag, or its
hand-written equivalent in a custom pass). Conflating them is exactly
the error that produced this bug; documenting them as separate concepts
is the only durable defense against repeating it.

Visual disparities that read as "brightness" are often mathematically a
*power* difference. `intensity` and `intensity²` look like a brightness
mismatch at first glance, but the more diagnostic phrasing is "the
falloff curve is different." Soft edges, dark twinkle troughs, and dim
stars are all things that linear `intensity` preserves and squared
`intensity` collapses. When debugging "the visuals are too bright" or
"the visuals are too dim," consider whether the bug might be a missing
exponent rather than a missing scalar.

Mathematical equivalence between two rendering paths' shader outputs does
not imply visual equivalence. Two shaders that produce the same fragment
value can still produce different framebuffer contents if the surrounding
GL state differs. This is the same lesson as the canvas-scaling
postmortem ("the bug can live in the container around the renderer
rather than the renderer itself"), specialized to the inner-loop GL
state machine instead of the outer DOM/CSS sizing model.

In-tree parity harnesses are only as strong as the camera and viewport
states they exercise. `lite-compare.html` is structurally a good
harness: same data, same shaders, side-by-side. It happened to use a
camera state in which the squared-vs-linear intensity disparity is
subtle. A harness that exercises the navigator's actual full-page
overview state would have caught this. Future parity work on the lite
renderer should include a fullscreen-overview configuration alongside
the existing half-pane shared-camera configuration.

## Future Follow-Up

### Erratum on `implementation-handoff.md`

The Phase 1 handoff (`implementation-handoff.md:228`) prescribed the wrong
`blendFunc*` recipe for the starfield additive blend. The document is left
intact for historical accuracy, but a future docs pass could add an
inline note pointing at this postmortem so the next contributor reading
the handoff for guidance is steered to the corrected recipe. This is a
small documentation-hygiene task, not blocking work.

### Audit other lite passes for similar mismatches

The lite renderer currently has two passes: gradient and starfield. The
gradient pass writes opaque colors with `BLEND` disabled
(`gradient-pass.ts:103`), so it cannot exhibit a parity bug of this
class. Future lite passes (any image, panorama, or specialty material
ported from three) should be audited at the time of authorship against
three's `WebGLState.setBlending` for the blend equation actually emitted
for the source material's flag combination, not against prose summaries
of three's behavior.

A useful ritual for future ports: when writing a hand-rolled WebGL pass
that is supposed to match a three material, write a one-line comment
above the `gl.blendFunc*` call citing the specific lines in
`node_modules/three/src/renderers/webgl/WebGLState.js` that the call is
mirroring, and the material flag combination assumed. That comment makes
the porting decision auditable and gives future readers a grounded
reference point.

### Visual regression coverage

There is no automated visual-regression test for starfield brightness
behavior. A modest version would be:

- Render a single frame of the lite starfield in a known camera state
  (the navigator's overview state, fov 50, full canvas, deterministic
  star data via a seeded RNG).
- Compare against a stored PNG within a tolerance.
- Repeat for the three-backed renderer if cross-validation is desired.

The hardest part is determinism — `Math.random()` in `buildStarBuffer`
needs to be seedable for the snapshot to be stable, and JavaScript's
built-in `Math.random` is not user-seedable. The realistic options are
either (a) monkey-patching `Math.random` with a small seedable PRNG
(e.g. mulberry32) for the duration of the test, or (b) threading a
seedable RNG through the buffer-build path as an option. Either way,
this is future work; it is not required for the current fix to be
considered complete.

### Fullscreen-overview parity harness

`example/lite-compare.html` runs in a half-pane shared-camera
configuration that did not exercise this bug. The canvas-scaling postmortem already
suggested an `example/fullscreen-compare.html` variant that would
overlap the three and lite renderers in the navigator's actual fullscreen
configuration. That same variant would also catch starfield-blend-style
regressions. Adding it remains future work; this postmortem is one more
data point that the harness gap is real.

### Document the two-`premultipliedAlpha` distinction

If/when reference docs grow for the lite skybox path (in the package
README, in a contributing guide, or in additional issue-reference docs),
they should specifically call out the canvas-context vs. material
`premultipliedAlpha` distinction. Any future contributor adding a lite
pass that mirrors a three material will need to internalize that
distinction; documenting it once means it does not have to be re-derived
each time.

## Current Status

The fix has landed in `src/skybox/lite/passes/starfield-pass.ts`.

- `npm test` — 77/77 tests pass.
- `npm run build` — passes.
- `node ./scripts/measure-bundles.mjs` — passes; all Phase 2 budgets and
  content assertions hold.
- `npm run example:build` — passes.
- Manual visual verification by the project owner confirms
  `example/dist/lite-skybox.html` and `example/dist/three-skybox.html`
  now look identical to the eye in the navigator's fullscreen overview
  state. The "dots vs stars" disparity is gone.

Phase 2's open issues are now both resolved at the visual-correctness
level: the canvas-scaling half of `phase-2-completion-handoff.md`
Issue #2 was closed by `lite-skybox-canvas-scaling-postmortem.md`, and
the brightness-curve half is closed here. Issue #1 (the lite/three host
API asymmetry around navigator-owned cameras) remains the standing item
for Phase 3.

The lite starfield renderer is now visually at parity with the
three-backed starfield in the configurations the package currently
supports. No public API changed. Bundle size grew by 53 bytes (essentially
the longer GL call); no Phase 2 budget threshold was crossed.
