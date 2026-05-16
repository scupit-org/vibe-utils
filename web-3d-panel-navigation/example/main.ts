import { ZoomPlaneNavigator, resolveContainerRefs } from '../dist/index.js';
import { liteBackend } from '../dist/lite-backend.js';

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(() => {
  // Default `main.ts` example: lite backend, no skybox. The smallest possible
  // surface — pure CSS3D navigation with the three-free primitives.
  new ZoomPlaneNavigator(resolveContainerRefs(), liteBackend);
});
