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

## Local scripts

```bash
npm test
npm run build
npm run example:build
```
