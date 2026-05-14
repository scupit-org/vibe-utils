import { ZoomPlaneNavigator, resolveContainerRefs } from '../dist/index.js';

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(() => {
  new ZoomPlaneNavigator(resolveContainerRefs());
});
