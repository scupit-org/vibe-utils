import { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import {
  ZoomPlaneNavigator,
  resolveContainerRefs,
  SkyboxHost,
  createStarfieldSkybox,
} from '../dist/index.js';

// Three's WebGLRenderer does `camera instanceof THREE.Camera` at render time,
// so it cannot accept our custom PerspectiveCamera. The example owns a separate
// three.js camera and copies the navigator camera's state into it every frame.
// This keeps the library's custom-camera path independent of three (the
// dist/skybox-lite.js bundle is unaffected) while still allowing consumers
// who want the three-backed skybox to wire it up.

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
  const navCamera = nav.getScene().camera;

  const skyCamera = new ThreePerspectiveCamera(
    navCamera.fov,
    navCamera.aspect,
    navCamera.near,
    navCamera.far,
  );
  const skybox = createStarfieldSkybox();
  const host = new SkyboxHost({
    camera: skyCamera,
    mount: document.body,
    skybox,
    canvasId: 'skybox-canvas',
    externalFrameLoop: true,
  });

  let lastTime = performance.now();
  function tick(now: number): void {
    const dt = now - lastTime;
    lastTime = now;
    syncCamera(skyCamera, navCamera);
    host.renderFrame(dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});

function syncCamera(
  threeCam: ThreePerspectiveCamera,
  navCam: ReturnType<ZoomPlaneNavigator['getScene']>['camera'],
): void {
  threeCam.position.set(navCam.position.x, navCam.position.y, navCam.position.z);
  threeCam.rotation.set(navCam.rotation.x, navCam.rotation.y, navCam.rotation.z, navCam.rotation.order);
  threeCam.up.set(navCam.up.x, navCam.up.y, navCam.up.z);
  if (
    threeCam.fov !== navCam.fov ||
    threeCam.aspect !== navCam.aspect ||
    threeCam.near !== navCam.near ||
    threeCam.far !== navCam.far
  ) {
    threeCam.fov = navCam.fov;
    threeCam.aspect = navCam.aspect;
    threeCam.near = navCam.near;
    threeCam.far = navCam.far;
    threeCam.updateProjectionMatrix();
  }
  threeCam.updateMatrixWorld();
}
