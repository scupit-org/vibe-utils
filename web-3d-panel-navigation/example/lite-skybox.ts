import { ZoomPlaneNavigator, resolveContainerRefs } from '../dist/index.js';
import { liteBackend, createStarfieldSkybox } from '../dist/lite-backend.js';

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(() => {
  const refs = resolveContainerRefs();
  const nav = new ZoomPlaneNavigator(refs, liteBackend);

  liteBackend.createSkyboxHost({
    camera: nav.getScene().camera,
    mount: document.body,
    skybox: createStarfieldSkybox(),
    canvasId: 'skybox-canvas',
    autoStart: true,
  });
});
