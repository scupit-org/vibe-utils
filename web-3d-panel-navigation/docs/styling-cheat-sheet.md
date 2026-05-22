# `@scupit/web-3d-panel-navigation` — Styling Cheat Sheet

> This cheat sheet covers every styling surface the package exposes: CSS custom
> properties, required HTML selectors, data attributes, runtime state classes,
> built-in content components, and JS configuration options that affect visual
> behavior.

---

## 1. Setup

Full (3D) page:

```ts
import '@scupit/web-3d-panel-navigation/engine.css';         // 3D layer (includes base structural hides)
import '@scupit/web-3d-panel-navigation/example-theme.css';  // reference theme — copy & replace
```

The package ships **three** stylesheet layers, split so a lite page never has
to load the 3D CSS:

- **`base.css`** — always-on structural hides (plane templates, back button).
  Needed in every mode; `engine.css` already includes it.
- **`engine.css`** — the functional rules for the 3D experience (clip-path
  reveal, fixed containers, section show/hide, scroll-lock). Every rule is
  scoped under `html.w3dpn-enhanced`, so it only applies while the experience
  is active. `@forward`s `base.css`. Import for full pages.
- **`example-theme.css`** — a **reference** cosmetic look plus the `--w3dpn-*`
  variable contract. Safe in plain document flow. Copy it and write your own;
  nothing here is load-bearing.

For a flash-free load, activate the engine layer before paint with a `<head>`
snippet:

```html
<script>
  if (!document.documentElement.classList.contains('lite-version'))
    document.documentElement.classList.add('w3dpn-enhanced');
</script>
```

### Lite / no-JS

A **lite page** imports `base.css` + a theme (no `engine.css`) and sets
`<html class="lite-version">`:

```ts
import '@scupit/web-3d-panel-navigation/base.css';
import './your-theme.css';
```

With JavaScript **disabled** on a full page, or on a lite page, the
`w3dpn-enhanced` class is never added, the gated `engine.css` rules stay inert
(and a lite page never even loads them), and the same markup renders as a
plain, scrollable document. Gate navigator construction with `shouldEnhance()`
so the backend never boots in lite mode. (This "lite presentation" is unrelated
to the "lite backend" renderer.)

---

## 2. CSS Custom Properties (Theme Variables)

All variables are declared on `:root` and prefixed with `--w3dpn-`. Override
them in your own `:root` block after importing the package stylesheet.

### Global / Page

| Variable | Default | Applied To |
|----------|---------|------------|
| `--w3dpn-font-family` | `'Segoe UI', system-ui, -apple-system, sans-serif` | `body` |
| `--w3dpn-page-background` | `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)` | `body`, `.page-section` |
| `--w3dpn-text-color` | `#e0e0e0` | `body` base color |

### Typography Inside Page Sections

| Variable | Default | Applied To |
|----------|---------|------------|
| `--w3dpn-heading-color` | `#fff` | `.page-section h1`, `.page-section h3`, back button text |
| `--w3dpn-subheading-color` | `#a0c4ff` | `.page-section h2` |
| `--w3dpn-body-copy-color` | `#c0c0c0` | `.page-section p`, `ul`, `ol` |
| `--w3dpn-link-color` | `#a0c4ff` | `.page-section a` |

### Zoom Planes (3D Surface Appearance)

| Variable | Default | Applied To |
|----------|---------|------------|
| `--w3dpn-plane-background` | `linear-gradient(180deg, #2a2a4a 0%, #1a1a3a 100%)` | `.zoom-plane` background |
| `--w3dpn-plane-border-color` | `#3a3a5a` | `.zoom-plane` default border |
| `--w3dpn-plane-border-hover-color` | `#5a7aff` | `.zoom-plane:hover` border |
| `--w3dpn-plane-label-color` | `rgba(255, 255, 255, 0.6)` | `.plane-label` text color |
| `--w3dpn-plane-inset-shadow` | `inset 0 0 60px rgba(100, 140, 255, 0.1)` | `.zoom-plane` default inner glow |
| `--w3dpn-plane-shadow` | `0 0 20px rgba(0, 0, 0, 0.5)` | `.zoom-plane` default outer shadow |
| `--w3dpn-plane-hover-inset-shadow` | `inset 0 0 80px rgba(100, 140, 255, 0.2)` | `.zoom-plane:hover` inner glow |
| `--w3dpn-plane-hover-shadow` | `0 0 30px rgba(90, 122, 255, 0.3)` | `.zoom-plane:hover` outer shadow |

> Both shadow variables on `.zoom-plane` are set together as a multi-value
> `box-shadow`: `var(--w3dpn-plane-inset-shadow), var(--w3dpn-plane-shadow)`.
> If you override one, also set the other or the comma-pair will break.

### UI Card / Surface Elements

| Variable | Default | Applied To |
|----------|---------|------------|
| `--w3dpn-surface-background` | `rgba(255, 255, 255, 0.05)` | `.project-card` background |
| `--w3dpn-surface-background-muted` | `rgba(255, 255, 255, 0.03)` | `.contact-info` background |
| `--w3dpn-surface-border` | `1px solid rgba(255, 255, 255, 0.1)` | `.project-card`, `.contact-info` border (full shorthand) |

> `--w3dpn-surface-border` is used as the entire `border` value (includes
> width, style, and color), so set it as a shorthand: `1px solid #yourcolor`.

### Back Button

| Variable | Default | Applied To |
|----------|---------|------------|
| `--w3dpn-backdrop-background` | `rgba(30, 30, 50, 0.9)` | `.back-button` default background |
| `--w3dpn-backdrop-background-hover` | `rgba(50, 50, 80, 0.95)` | `.back-button:hover` background |
| `--w3dpn-backdrop-border` | `1px solid rgba(255, 255, 255, 0.2)` | `.back-button` border (full shorthand) |
| `--w3dpn-backdrop-border-hover` | `rgba(90, 122, 255, 0.5)` | `.back-button:hover` and `.project-card:hover` border-color |

> `--w3dpn-backdrop-border` is the full border shorthand. `--w3dpn-backdrop-border-hover` is only the color value (applied via `border-color`).

### What Is *Not* Exposed as a Variable

The following properties are hard-coded in the shipped stylesheet. To change
them you must override the raw selectors in your own CSS (after importing the
package stylesheet). Listed here so you don't waste time looking for variables
that don't exist.

**`.zoom-plane`**

- `border` width: `8px`
- `border-radius`: `4px`
- `transition`: `border-color 0.2s, box-shadow 0.2s, opacity 0.3s`

**`.plane-label`**

- `font-size`: `96px`
- `font-weight`: `700`
- `letter-spacing`: `8px`
- `text-transform`: `uppercase`

**`.page-section`**

- `padding`: `4rem`
- `min-height`: `100vh`
- `h1`: `font-size: 3rem; font-weight: 200; letter-spacing: 2px`
- `h2`: `font-size: 1.8rem; font-weight: 300`
- `h3`: `font-size: 1.3rem; font-weight: 400`
- `p, ul, ol`: `font-size: 1.1rem; line-height: 1.8; max-width: 800px`

**`.project-grid`**

- `grid-template-columns`: `repeat(auto-fit, minmax(280px, 1fr))`
- `gap`: `2rem`
- `max-width`: `1200px`

**`.project-card` / `.contact-info`**

- `border-radius`: `12px`
- `padding`: `2rem`
- `.project-card` hover lift: `translateY(-4px)`
- `.contact-info` `max-width`: `500px`

**`.back-button`**

- Fixed position at `top: 2rem; left: 2rem`
- `padding`: `0.875rem 1.75rem`
- `font-size`: `1rem`; `font-weight`: `400`; `letter-spacing`: `0.5px`
- `border-radius`: `8px`
- `backdrop-filter`: `blur(10px)`
- `z-index`: `1000`

**Scene container transitions**

- `#scene-container` opacity: `transition: opacity 0.3s ease-in-out`

---

## 3. Minimal Theme Override Example

```css
:root {
  --w3dpn-font-family: 'Inter', system-ui, sans-serif;
  --w3dpn-page-background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  --w3dpn-text-color: #f1f5f9;
  --w3dpn-heading-color: #ffffff;
  --w3dpn-subheading-color: #7dd3fc;
  --w3dpn-body-copy-color: #cbd5e1;
  --w3dpn-link-color: #38bdf8;

  --w3dpn-plane-background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  --w3dpn-plane-border-color: #334155;
  --w3dpn-plane-border-hover-color: #38bdf8;
  --w3dpn-plane-label-color: rgba(255, 255, 255, 0.5);
  --w3dpn-plane-inset-shadow: inset 0 0 60px rgba(56, 189, 248, 0.08);
  --w3dpn-plane-shadow: 0 0 20px rgba(0, 0, 0, 0.6);
  --w3dpn-plane-hover-inset-shadow: inset 0 0 80px rgba(56, 189, 248, 0.18);
  --w3dpn-plane-hover-shadow: 0 0 30px rgba(56, 189, 248, 0.3);

  --w3dpn-surface-background: rgba(255, 255, 255, 0.04);
  --w3dpn-surface-background-muted: rgba(255, 255, 255, 0.02);
  --w3dpn-surface-border: 1px solid rgba(255, 255, 255, 0.08);

  --w3dpn-backdrop-background: rgba(15, 23, 42, 0.9);
  --w3dpn-backdrop-background-hover: rgba(30, 41, 59, 0.95);
  --w3dpn-backdrop-border: 1px solid rgba(255, 255, 255, 0.15);
  --w3dpn-backdrop-border-hover: rgba(56, 189, 248, 0.5);
}
```

---

## 4. Required HTML Structure and Selectors

These IDs and classes are **required by the package** — both `resolveContainerRefs()` and the bundled stylesheet rely on them, so they are part of the contract and are not configurable.

### Global Document Rules (Applied Automatically)

`example-theme.css` applies a baseline reset (`html, body { margin: 0; padding: 0 }`).
The **viewport ownership** rules live in `engine.css` and are gated, so they
only apply in the full experience:

```css
html.w3dpn-enhanced, html.w3dpn-enhanced body {
  overflow: hidden;
  height: 100%;
}
```

This is **required** behavior for the 3D mode: the package owns the viewport,
disables page scrolling, and fills the screen. Section scrolling then happens
inside `#page-content-container` once `.fully-visible` is applied. In lite /
no-JS mode these rules are absent, so the document scrolls normally.

### Container IDs

| Element ID | Purpose |
|------------|---------|
| `#zoom-planes-source` | Holds plane definition elements. Hidden in every mode via `display: none` (a `base.css` rule, so it applies even on lite pages that skip `engine.css`). |
| `#scene-container` | The CSS3D scene root. Fixed fullscreen, `z-index: 1`. |
| `#page-content-container` | Content reveal target. Fixed fullscreen, `z-index: 10`, starts with `clip-path: inset(50% 50% 50% 50%)` and `opacity: 0`. |

### Component Classes

| Class | Purpose |
|-------|---------|
| `.zoom-plane` | A 3D plane surface element inside `#zoom-planes-source`. Receives background, border, shadow, cursor, and opacity transition. |
| `.plane-label` | Text label inside a `.zoom-plane`. Gets large font size, uppercase, letter-spacing, and `pointer-events: none`. |
| `.page-section` | A content section inside `#page-content-container`. Hidden (`display: none`) by default; shown when `.active` is added. |
| `.project-grid` | Responsive CSS grid layout helper for card groups inside a section. |
| `.project-card` | Individual card within a `.project-grid`. Gets surface background, border, border-radius, and a hover lift. |
| `.contact-info` | Contact block with muted surface background and border. |
| `.back-button` | Fixed-position button (top-left). Gets backdrop-filter blur, backdrop background/border, and hover/active transitions. |

---

## 5. Runtime State Classes

The package adds and removes these classes automatically as navigation state
changes. You should not toggle them manually during normal use — with one
documented exception below (`.back-button.hidden`), which is also the correct
**initial** state to render in your HTML.

### On `#scene-container`

| Class | Effect |
|-------|--------|
| `.hidden` | `opacity: 0; pointer-events: none` — fades out the scene |
| `.fully-hidden` | `display: none` — completely removes the scene from rendering |

### On `#page-content-container`

| Class | Effect |
|-------|--------|
| *(no class)* | `clip-path: inset(50% …)`, `opacity: 0` — content fully hidden |
| `.visible` | Added at the start of zoom-in and removed at the end of zoom-out. The shipped stylesheet does **not** style `.visible`; it is provided as an unstyled hook for consumer CSS (e.g. layering custom effects while a section is active or in transit). |
| `.fully-visible` | `clip-path: none; overflow-y: auto` — content fully visible and scrollable. Added after the clip reveal completes. |

### On `.page-section`

| Class | Effect |
|-------|--------|
| *(no class)* | `display: none` |
| `.active` | `display: block` — makes the section visible |

### On `.back-button`

| Class | Effect |
|-------|--------|
| `.hidden` | `display: none` |
| *(no class)* | Shown — but only in the full experience. `base.css` hides the button by default in every mode and `engine.css` reveals it via `html.w3dpn-enhanced .back-button:not(.hidden)`, so it never appears in lite / no-JS. |

> **Initial state note:** Render the back button with `class="back-button hidden"`
> in your HTML. The page loads in overview mode, so the button should start
> hidden. The package toggles `.hidden` on state changes after that. Omitting
> the initial `hidden` class causes a visible flash on page load.

---

## 6. Zoom Plane Data Attributes

These are set on each `.zoom-plane` element inside `#zoom-planes-source`.

### Required Base Attributes

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `data-zoom-plane` | string | Unique identifier for the plane | `"about"` |
| `data-section` | string | ID of the `.page-section` to reveal | `"page-about"` |
| `data-width` | number | Plane width in world units | `"1920"` |
| `data-height` | number | Plane height in world units | `"1080"` |

### Layout Attributes

Use either explicit layout or tiled layout.

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `data-position` | `x, y, z` | World-space position | `"-850, 0, 100"` |
| `data-rotation` | `x, y, z` | Rotation in degrees on each Euler axis | `"0, 30, 0"` |
| `data-tile-from-right` | string | Attach this plane's left edge to the reference plane's right edge | `"about"` |
| `data-tile-from-left` | string | Attach this plane's right edge to the reference plane's left edge | `"about"` |
| `data-tile-from-top` | string | Attach this plane's bottom edge to the reference plane's top edge | `"about"` |
| `data-tile-from-bottom` | string | Attach this plane's top edge to the reference plane's bottom edge | `"about"` |
| `data-tile-angle` | number | Tiled rotation angle in degrees; positive folds inward toward the reference plane's front side | `"30"` |
| `data-tile-gap` | number | Optional spacing away from the reference edge in world units. | `"45"` |
| `data-tile-align` | string | Optional edge alignment. Use `top`, `center`, or `bottom` for left/right tiles; `left`, `center`, or `right` for top/bottom tiles. | `"top"` |
| `data-tile-align-offset` | number | Optional extra nudge along the alignment axis in world units. | `"-90"` |
| `data-tile-offset` | `x, y` | Optional advanced additive reference-local hinge offset. `x` follows reference right, `y` follows reference up. Values use world units like `data-position`. | `"40, -20"` |
| `data-tile-rotation-offset` | `x, y, z` | Optional reference-relative Euler rotation offset in degrees. Keeps the attached edge center anchored but can intentionally make the edge imperfectly flush. | `"0, 2, -1"` |

Tiled defaults are `data-tile-gap="0"`, `data-tile-align="center"`, `data-tile-align-offset="0"`, `data-tile-offset="0, 0"`, and `data-tile-rotation-offset="0, 0, 0"`. The final hinge offset is computed from gap/alignment first, then `data-tile-align-offset`, then the manual `data-tile-offset`.

### Optional

| Attribute | Description |
|-----------|-------------|
| `data-zoom-center` | Boolean presence attribute. Marks this as the focal plane. The camera aligns perpendicular to it in overview mode. Only one plane may have this. Omitting it on all planes activates Balanced Scene Mode instead. |

### Full Example

```html
<div id="zoom-planes-source">

  <!-- Focal plane: camera centers on this one in overview -->
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

  <!-- Tiled side panel: left edge connected to the focal plane's right edge -->
  <div class="zoom-plane"
       data-zoom-plane="projects"
       data-section="page-projects"
       data-width="1920"
       data-height="1080"
       data-tile-from-right="about"
       data-tile-angle="30"
       data-tile-gap="45"
       data-tile-align="top"
       data-tile-rotation-offset="0, 2, -1">
    <span class="plane-label">Projects</span>
  </div>

</div>
```

---

## 7. JS Configuration (`NavigationConfig`)

Pass a partial config as the second argument to `ZoomPlaneNavigator`. Unset
options fall back to `DEFAULT_CONFIG`.

```ts
const nav = new ZoomPlaneNavigator(refs, {
  cameraDuration: 1200,
  overlapRatio: 0.2,
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `scale` | `0.5` | Scale factor applied to all planes in world space. Increase to make planes physically larger in the scene. |
| `overviewFov` | `50` | Field of view (degrees) for the overview camera. Higher = wider / more distorted. |
| `detailFov` | `50` | Field of view when zoomed into a plane. |
| `fillPercentage` | `0.8` | How much of the viewport height the plane fills when zoomed in (`0`–`1`). |
| `cameraDuration` | `1000` | Camera animation duration in milliseconds. |
| `clipDuration` | `400` | Clip-path reveal / conceal duration in milliseconds. Content opacity transitions in sync. |
| `overlapRatio` | `0.15` | How early the clip reveal starts relative to the camera tail (`0`–`1`). At `0.15`, the clip starts when the camera is 85% complete. |
| `overviewPadding` | `0.15` | Fractional padding added around the scene bounding box in overview. Increase for more breathing room. |

---

## 8. Full Minimal HTML Template

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script>
    if (!document.documentElement.classList.contains('lite-version'))
      document.documentElement.classList.add('w3dpn-enhanced');
  </script>
  <link rel="stylesheet" href="...engine.css">
  <link rel="stylesheet" href="...example-theme.css">
</head>
<body>

  <!-- Plane definitions (invisible in layout) -->
  <div id="zoom-planes-source">
    <div class="zoom-plane"
         data-zoom-plane="main"
         data-section="page-main"
         data-width="1600"
         data-height="900"
         data-position="0, 0, 0"
         data-rotation="0, 0, 0"
         data-zoom-center>
      <span class="plane-label">Main</span>
    </div>
  </div>

  <!-- CSS3D scene renders here -->
  <div id="scene-container"></div>

  <!-- Revealed page content -->
  <div id="page-content-container">
    <section id="page-main" class="page-section">
      <h1>Main</h1>
      <p>Content here.</p>
    </section>
  </div>

  <!-- Optional back button -->
  <button id="back-button" class="back-button hidden">&#8592; Back</button>

</body>
</html>
```

```ts
import { ZoomPlaneNavigator, resolveContainerRefs, shouldEnhance } from '@scupit/web-3d-panel-navigation';
import '@scupit/web-3d-panel-navigation/engine.css';
import '@scupit/web-3d-panel-navigation/example-theme.css';

if (shouldEnhance()) {
  const nav = new ZoomPlaneNavigator(resolveContainerRefs());
}
```

---

## 9. Quick Reference — Variable Groupings at a Glance

```
GLOBAL
  --w3dpn-font-family
  --w3dpn-page-background
  --w3dpn-text-color

TYPOGRAPHY (inside .page-section)
  --w3dpn-heading-color        → h1, h3
  --w3dpn-subheading-color     → h2
  --w3dpn-body-copy-color      → p, ul, ol
  --w3dpn-link-color           → a

PLANES (3D surfaces)
  --w3dpn-plane-background
  --w3dpn-plane-border-color
  --w3dpn-plane-border-hover-color
  --w3dpn-plane-label-color
  --w3dpn-plane-inset-shadow          ┐ used together
  --w3dpn-plane-shadow                ┘ in box-shadow
  --w3dpn-plane-hover-inset-shadow    ┐ used together
  --w3dpn-plane-hover-shadow          ┘ in box-shadow

SURFACE CARDS
  --w3dpn-surface-background
  --w3dpn-surface-background-muted
  --w3dpn-surface-border              (full shorthand)

BACK BUTTON / OVERLAYS
  --w3dpn-backdrop-background
  --w3dpn-backdrop-background-hover
  --w3dpn-backdrop-border             (full shorthand)
  --w3dpn-backdrop-border-hover       (color value only)
```
