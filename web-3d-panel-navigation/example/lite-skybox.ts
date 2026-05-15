import { ZoomPlaneNavigator, resolveContainerRefs } from '../dist/index.js';
import { LiteSkyboxHost, createStarfieldSkybox } from '../dist/skybox-lite.js';

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(() => {
  const refs = resolveContainerRefs();
  const nav = new ZoomPlaneNavigator(refs);
  const camera = nav.getScene().camera;

  const skybox = createStarfieldSkybox();
  new LiteSkyboxHost({
    camera,
    mount: document.body,
    skybox,
    canvasId: 'skybox-canvas',
    autoStart: true,
  });
});
