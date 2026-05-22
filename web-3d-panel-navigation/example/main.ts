import { ZoomPlaneNavigator, resolveContainerRefs, shouldEnhance } from '../dist/index.js';
import { liteBackend } from '../dist/lite-backend.js';

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(() => {
  // Skip the 3D experience entirely on a lite presentation
  // (`<html class="lite-version">`); the same page then renders as plain,
  // scrollable document flow. The lite.html variant exercises this path.
  if (!shouldEnhance()) return;

  // Default `main.ts` example: lite backend, no skybox. The smallest possible
  // surface — pure CSS3D navigation with the three-free primitives.
  new ZoomPlaneNavigator(resolveContainerRefs(), liteBackend);
});
