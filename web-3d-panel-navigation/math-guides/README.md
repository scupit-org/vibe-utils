# Math Guides for `web-3d-panel-navigation`

A curriculum that teaches the math behind this package by anchoring every concept to specific code in `src/`. Read in numeric order; each guide assumes only material from earlier guides.

## How the guides are written

- Every guide has the same skeleton: **why this matters → intuition → math → in this codebase (verbatim snippets) → worked examples → exercises (with solutions in an appendix) → where to next**.
- **LaTeX (`.tex`)** for guides that are mostly formula derivations. Compile with `pdflatex <file>.tex`. Most use `amsmath`, `amssymb`, and `tikz`.
- **HTML (`.html`)** for guides where a slider, plot, or canvas materially helps. Open directly in a browser — equations render via MathJax v3 from a CDN, and interactive widgets are vanilla JS (no build step, no `npm install`).
- Exercises: each guide has at least 5 problems plus 2 extension challenges. Solutions live in an appendix (collapsed `<details>` block in HTML; final section in LaTeX).

## Reading order

| # | Guide | Topic | Prereqs |
|---|---|---|---|
| 01 | [`01-vectors-and-3d-space.tex`](01-vectors-and-3d-space.tex) | Vectors, magnitude, normalization, dot product as projection and as `cos θ`. | — |
| 02 | [`02-trigonometry-for-3d.tex`](02-trigonometry-for-3d.tex) | Degrees↔radians, sin/cos/tan, similar triangles, the `tan(fov/2)` setup. | 01 |
| 03 | [`03-linear-interpolation-and-easing.html`](03-linear-interpolation-and-easing.html) | Lerp, remap, clamp, easeInOutCubic / easeOutCubic, smoothstep. | 01, 02 |
| 04 | [`04-rotation-matrices-and-euler-angles.tex`](04-rotation-matrices-and-euler-angles.tex) | 2D → 3D rotation matrices, XYZ Euler order, composition order, gimbal lock. | 01, 02 |
| 05 | [`05-quaternions-and-axis-angle.tex`](05-quaternions-and-axis-angle.tex) | Axis-angle, quaternion algebra, multiplication as composition. | 04 |
| 06 | [`06-coordinate-frames-and-basis-vectors.tex`](06-coordinate-frames-and-basis-vectors.tex) | Local frames, "rotate the standard basis" pattern, local-to-world transforms. | 04, 05 |
| 07 | [`07-perspective-projection.html`](07-perspective-projection.html) | Pinhole camera, NDC, viewport mapping, the Y-flip. | 02, 04 |
| 08 | [`08-fov-frustum-and-camera-framing.html`](08-fov-frustum-and-camera-framing.html) | Frustum height `2d·tan(fov/2)`, dual-axis fitting, padding, depth back-offset. | 02, 07 |
| 09 | [`09-bounding-boxes-and-screen-rects.tex`](09-bounding-boxes-and-screen-rects.tex) | AABB aggregation, projecting corners, deriving CSS `inset()`. | 06, 07 |
| 10 | [`10-spherical-linear-interpolation.html`](10-spherical-linear-interpolation.html) | Why lerp fails for orientations; deriving slerp; parallel-vector fallback. | 02, 03, 05 |
| 11 | [`11-hinge-tiling-capstone.html`](11-hinge-tiling-capstone.html) | The full tiling pipeline as one composition: hinge → fold → compose → recover center. | 03, 05, 06 |
| 12 | [`12-adaptive-camera-transitions.html`](12-adaptive-camera-transitions.html) | Total reorientation angle, smoothstep blend, Early-Look vs Orbit, phase composition. | 03, 06, 10 |
| 13 | [`13-shader-math-gradients-and-falloff.html`](13-shader-math-gradients-and-falloff.html) | GLSL primer; directional gradient via dot product; 3-stop mix; radial smoothstep. | 01, 03 |
| 14 | [`14-shader-math-twinkles-and-time.html`](14-shader-math-twinkles-and-time.html) | Sinusoidal phase modulation, additive blending, power-law tint biasing. | 02, 13 |
| 15 | [`15-uniform-sphere-sampling.html`](15-uniform-sphere-sampling.html) | Why naive sampling clusters at corners; deriving the inverse-transform sampler. | 02, 13 |
| 16 | [`16-equirectangular-and-spherical-coords.tex`](16-equirectangular-and-spherical-coords.tex) | Spherical coordinates, equirectangular projection, distortion at the poles. | 02, 15 |

## Source files anchored by the curriculum

These are the canonical files the guides quote and reference. By the end of guide 16 you should be able to read all of them comfortably.

- `src/zoom-plane-parser.ts` — parser, basis vectors, hinge tiling, quaternion composition
- `src/zoom-plane-parser.test.ts` — clarifying tests for tiling math
- `src/projection.ts` — projection, AABB, plane corners, screen-rect, clip-path
- `src/camera-controller.ts` — perpendicular framing
- `src/overview-camera.ts` — overview framing modes
- `src/camera-transitions.ts` — angle math, smoothstep blend, slerp, easing application
- `src/easing.ts` — easing primitives + `remap`
- `src/animation-timeline.ts` — phase progress
- `src/zoom-navigation.ts` — phase composition for zoom in/out
- `src/css3d-renderer.ts` — CSS3D matrix output
- `src/skybox/gradient-mesh.ts` — gradient shader source
- `src/skybox/starfield-skybox.ts` — twinkle, sphere sampling, additive blend
- `src/skybox/panorama-skybox.ts` — equirectangular mapping
- `src/types.ts` — config shape and default constants

## Compile / view

- **LaTeX**: `pdflatex 04-rotation-matrices-and-euler-angles.tex` (run twice if you have cross-references). Requires a TeX distribution with `amsmath`, `amssymb`, and `tikz`.
- **HTML**: open the file directly in any modern browser. No server required. MathJax loads from `cdn.jsdelivr.net`, so an internet connection is needed the first time (or for fresh equation rendering).

## Conventions

- All angles in formulas are in **radians** unless noted. The project sometimes parses degrees from HTML attributes and converts immediately; guides flag this where it matters.
- Three.js helpers (`.applyEuler`, `.lerpVectors`, `.setFromAxisAngle`, etc.) are explained in terms of the math they implement, not treated as black boxes.
- Coordinate convention matches Three.js: right-handed, +Y up, camera looks down −Z.
