import { ZoomPlaneNavigator, resolveContainerRefs } from '../dist/index.js';
import { threeBackend, createStarfieldSkybox } from '../dist/three-backend.js';

// Phase 3 unified the consumer surface across backends. The navigator's
// camera in this configuration is a real THREE.PerspectiveCamera (produced by
// `threeBackend.createPerspectiveCamera`), which `THREE.WebGLRenderer.render`
// accepts directly — no sibling camera, no per-frame sync.

function onReady(callback: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

onReady(() => {
  const refs = resolveContainerRefs();
  const nav = new ZoomPlaneNavigator(refs, threeBackend);

  threeBackend.createSkyboxHost({
    camera: nav.getScene().camera,
    mount: document.body,
    skybox: createStarfieldSkybox(),
    canvasId: 'skybox-canvas',
    autoStart: true,
  });
});
