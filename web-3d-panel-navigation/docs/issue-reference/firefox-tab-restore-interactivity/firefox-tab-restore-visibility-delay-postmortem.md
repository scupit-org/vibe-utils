# Firefox Tab Restore Visibility Delay Decision Post-Mortem

## Summary

`sky-site` exposed a Firefox-specific delay after switching away to another browser tab and then returning to the homepage. Panel hover and click interaction stayed stale for roughly 0.5 to 1 second. During a short local experiment, `ZoomPlaneNavigator` listened for `document.visibilitychange` and, when the document became visible again, requested a CSS3D render plus the existing raster/hit-test refresh.

That experiment confirmed that the panel interactivity problem and the post-visibility raster refresh were related. However, it also showed that the `visibilitychange` event itself was delayed in the reproducing browser path. The debug log did not appear until the same moment the panels became interactive again.

The retained decision is to remove the experimental `visibilitychange` handler from `ZoomPlaneNavigator` and not add a library workaround for this specific tab-restore delay. Current evidence points to Firefox's tab lifecycle/event timing and CSS3D/WebRender behavior, not to missing application polling or a Three.js render-loop bug in the navigation package.

The existing post-load and scene-show raster refresh remains in place because it fixes the earlier Firefox/Windows CSS3D raster and hit-test issue without depending on tab lifecycle timing.

## Affected Code

The observed issue was in the `sky-site` homepage using:

- `sky-site/src/home/home.ts`
- `sky-site/src/home/home.scss`
- `sky-site/src/index.html`
- `vibe-utils/web-3d-panel-navigation/src/zoom-navigation.ts`
- `vibe-utils/web-3d-panel-navigation/src/scene-graph.ts`
- `vibe-utils/web-3d-panel-navigation/src/css3d-renderer.ts`

The removed experiment touched:

- `vibe-utils/web-3d-panel-navigation/src/zoom-navigation.ts`

The consumer dependency was also restored from a local portal dependency back to the published package:

- `sky-site/package.json`
- `sky-site/yarn.lock`

## User-Visible Symptoms

The symptom sequence was:

- User navigates from `sky-site` to another browser tab.
- User returns to the `sky-site` tab.
- Homepage panels are not immediately interactive.
- After roughly 0.5 to 1 second, the experimental `visibilitychange` debug log appears with the `render-and-raster-refresh` action.
- At the same time, panels become interactive again.

This is different from the earlier post-load Firefox clipping issue. In this case, the page was already loaded and working before the tab switch. The stale state appeared after browser tab activation.

## Investigation Path

The first hypothesis was that `web-3d-panel-navigation` had retained a polling or throttling mechanism after the homepage rendering performance work. That was not the case.

The current navigation package uses an on-demand CSS3D render model:

- It renders during active zoom transitions.
- It requests one-off renders for resize, overview recalculation, return-to-overview completion, and scene-show paths.
- It does not run a permanent CSS3D render loop while idle.
- It already schedules a one-frame transparent-outline raster refresh after initialization and when the scene is shown again.

The experiment added a `visibilitychange` listener to request a render and schedule that same raster refresh when the document became visible. Debug logging showed the handler did fire and the refresh repaired interaction, but the event arrived late enough that it did not improve the observed delay.

## Research Findings

The web research found two relevant classes of browser behavior.

### Firefox visibilitychange timing

Mozilla Bug 2007988, "visibilitychange delayed when opening new tab (blur fires quickly)", reports that Firefox can delay `visibilitychange` by hundreds of milliseconds while `blur` fires almost immediately. The reported repro compared Firefox against Chromium and observed a roughly 300 ms delay in Firefox:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=2007988>

Mozilla Bug 1876604 is also relevant to Firefox tab switching and document visibility state updates. Search-indexed Bugzilla text notes that tests could not simply await `visibilitychange` because it had the same approximately 300 ms delay as other attempted events:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1876604>

MDN documents `visibilitychange` as the Page Visibility API signal for tab switches, minimization, and similar visibility transitions. The same page also documents background-tab browser policies such as stopping `requestAnimationFrame()` callbacks and throttling timers:

- <https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API>

Chrome's Page Lifecycle guidance is useful as contrast. It treats `focus`, `blur`, `visibilitychange`, `pageshow`, and related lifecycle events as separate signals, and recommends capture-phase listeners because lifecycle events have different targets and many do not bubble:

- <https://developer.chrome.com/docs/web-platform/page-lifecycle-api>

That guidance supports a possible future multi-event workaround, but it also reinforces that `visibilitychange` alone is not the earliest possible signal for every lifecycle transition.

### CSS3D and Firefox/WebRender fragility

Three.js documents an important `CSS3DRenderer` limitation: it only supports 100% browser and display zoom. That aligns with the earlier Firefox/Windows display scaling postmortem and keeps CSS3D rendering in a fragile browser-controlled path:

- <https://threejs.org/docs/pages/CSS3DRenderer.html>

Mozilla Bug 1081185, "CSS 3D transform clipped wrongly", is an older but conceptually relevant CSS 3D transform visible-rect bug:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1081185>

Mozilla Bug 1893205, "Certain 3D CSS usage crashes WebRenderer process on Windows, leaving Firefox running poorly until the whole process is restarted", shows that Firefox/WebRender has had Windows-specific issues around 3D CSS:

- <https://bugzilla.mozilla.org/show_bug.cgi?id=1893205>

These sources do not prove the exact `sky-site` issue is a Firefox bug. They do show that both parts of the observed behavior are plausible browser-side failure modes: delayed tab lifecycle notification and stale CSS3D/WebRender raster or hit-test state.

## Working Hypothesis

The most likely cause is a Firefox browser behavior involving two layers:

1. Tab activation does not deliver `visibilitychange` immediately in the tested path.
2. The CSS3D panel layer or its hit-test data remains stale until a later render/invalidation pass occurs.

The experimental handler repaired the second layer, but it depended on the first layer. Because the event itself arrived late, the handler could not make the interaction responsive immediately after tab activation.

This means the root symptom is not a normal application render-throttling bug. The package is already idle-aware by design, and the experiment did not reveal a missing local polling loop.

## What Was Ruled Out

### Permanent Polling In The Navigation Package

The package no longer uses the old permanent CSS3D render loop. The homepage performance work intentionally replaced it with on-demand rendering to reduce idle CPU/GPU cost.

Conclusion: there is no library polling loop to tune for this issue.

### Missing Raster Refresh Primitive

`SceneGraph.schedulePostLoadRasterRefresh()` already exists and is effective. The experimental `visibilitychange` handler reused it, and the panels became interactive after it ran.

Conclusion: the library has a known repair primitive for stale CSS3D raster/hit-test state.

### visibilitychange As A Sufficient Repair Trigger

The debug logging showed that `visibilitychange` was delayed along with the fix. Waiting for that event did not improve responsiveness.

Conclusion: `visibilitychange` alone is not a useful workaround for this Firefox tab-restore path.

### A Pure Three.js Logic Bug

The problem is in DOM/CSS3D rendering and hit-testing after browser tab activation. Three.js CSS3D rendering ultimately relies on browser CSS transforms, rasterization, compositing, and hit-test behavior.

Conclusion: this is better understood as browser CSS3D/lifecycle behavior than as a Three.js scene math or camera bug.

## Decision

Do not retain the experimental `visibilitychange` handler in `ZoomPlaneNavigator`.

The reasons are:

- It did not fire early enough to improve the user-visible delay in Firefox.
- It added lifecycle complexity to the core navigator for a browser-specific edge case.
- It added debug logging that should not ship in the library.
- A stronger workaround would need multiple lifecycle and input signals, which increases complexity and risk for a small browser-specific delay.
- The existing post-load and scene-show raster refreshes still cover the known Firefox/WebRender stale-bounds issue without relying on tab activation timing.

The consumer `sky-site` should continue using the published package dependency unless local library development is intentionally needed.

## Removed Experiment

The experiment removed from `ZoomPlaneNavigator` was equivalent to:

```ts
document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);
```

with a handler that logged `hidden`, navigator state, and a `render-and-raster-refresh` action, then called:

```ts
this.requestRender();
this.sceneGraph.schedulePostLoadRasterRefresh();
```

when the document was visible and the navigator was not in `section` state.

That implementation was useful for diagnosis, but it is not retained.

## Why Not Add A Bigger Workaround Now

A more aggressive workaround could listen to `window.focus`, `pageshow`, and perhaps first pointer input after tab activation, then schedule the existing render/raster refresh from the earliest observed signal.

That is intentionally deferred because:

- the issue appears browser-specific and short-lived
- `visibilitychange` already proved too late in the tested path
- input-event repair could add work to hot interaction paths
- lifecycle events have cross-browser target and bubbling differences
- the current package behavior is simpler and already avoids continuous rendering

If this becomes a frequent practical problem, the next investigation should test a bounded multi-signal repair with capture-phase listeners and strict throttling.

## Verification

Verification for the rollback should include:

- `ZoomPlaneNavigator` no longer registers a `visibilitychange` listener.
- The local debug log string is gone.
- `sky-site/package.json` uses the published `@scupit/web-3d-panel-navigation` dependency.
- `sky-site/yarn.lock` is regenerated after reinstalling dependencies.
- The navigation package still builds after removing the experiment.
- The homepage build still succeeds after dependency restoration.

Manual Firefox tab-switch testing may still reproduce the short delay. That is expected under this decision record and is not treated as a release-blocking library bug.

## Future Follow-Up

If the Firefox delay becomes disruptive enough to justify a browser-specific mitigation, start from this plan:

1. Measure `blur`, `focus`, `visibilitychange`, `pageshow`, `pointermove`, and `pointerdown` timing in the reproducing browser.
2. Confirm which event arrives before panel interactivity recovers.
3. Route only the earliest useful low-risk signals into a throttled render/raster refresh.
4. Avoid permanent render loops and avoid per-pointer refreshes after the page has recovered.
5. Keep logging behind an explicit debug option instead of unconditional `console.debug`.

If a reduced repro can be created, file it with Mozilla because the symptoms line up with browser event timing plus CSS3D/WebRender hit-test invalidation.

## Current Status

The library keeps the retained performance architecture:

- on-demand CSS3D rendering
- no permanent CSS3D render loop
- explicit scene/content pointer ownership
- post-load raster/hit-test refresh for Firefox CSS3D stale bounds
- scene-show raster/hit-test refresh after returning from section content

The Firefox tab-restore delay is documented as a known browser-adjacent limitation rather than hidden behind a partial workaround.
