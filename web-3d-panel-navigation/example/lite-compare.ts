import {
  threeBackend,
  createGradientSkybox as createGradientSkyboxThree,
  createStarfieldSkybox as createStarfieldSkyboxThree,
  type SkyboxHost as ThreeSkyboxHost,
  type ThreeRenderTypes,
} from "../dist/three-backend.js";
import {
  liteBackend,
  createGradientSkybox as createGradientSkyboxLite,
  createStarfieldSkybox as createStarfieldSkyboxLite,
  type LiteSkyboxHost,
  type LiteRenderTypes,
} from "../dist/lite-backend.js";
import type {
  PerspectiveCameraLike,
  RenderBackend,
  RenderTypes,
} from "../dist/render-contract.js";

// Side-by-side visual parity harness. Each column owns a backend-native
// camera built via that backend's `createPerspectiveCamera` factory; the
// two cameras are kept in lockstep every frame so any visual delta is
// purely backend-driven (three's WebGLRenderer vs the lite raw-WebGL2
// path) rather than a camera-type mismatch.
//
// The harness intentionally constructs cameras directly rather than going
// through ZoomPlaneNavigator — its purpose is to exercise just the skybox
// hosts. Camera state is mutated manually below to produce the slow yaw
// drift the visual check relies on.

type Flavor = "gradient" | "starfield";
type ThreeCamera = ThreeRenderTypes["PerspectiveCamera"];
type LiteCamera = LiteRenderTypes["PerspectiveCamera"];

function makeCamera<T extends RenderTypes>(backend: RenderBackend<T>): T["PerspectiveCamera"] {
  const cam = backend.createPerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -1);
  return cam;
}

function buildThree(mount: HTMLElement, camera: ThreeCamera, flavor: Flavor): ThreeSkyboxHost {
  const skybox = flavor === "gradient" ? createGradientSkyboxThree() : createStarfieldSkyboxThree();
  return threeBackend.createSkyboxHost({
    camera, mount, skybox, canvasId: "three-skybox-canvas", autoStart: false,
  });
}

function buildLite(mount: HTMLElement, camera: LiteCamera, flavor: Flavor): LiteSkyboxHost {
  const skybox = flavor === "gradient" ? createGradientSkyboxLite() : createStarfieldSkyboxLite();
  return liteBackend.createSkyboxHost({
    camera, mount, skybox, canvasId: "lite-skybox-canvas", autoStart: false,
  });
}

function setStatus(text: string): void {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function onReady(cb: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cb);
  } else {
    cb();
  }
}

onReady(() => {
  const paneThree = document.getElementById("pane-three") as HTMLElement;
  const paneLite = document.getElementById("pane-lite") as HTMLElement;
  const toggleBtn = document.getElementById("toggle-flavor") as HTMLButtonElement;
  const loseBtn = document.getElementById("lose-context") as HTMLButtonElement;

  // Constrain each canvas to its pane via inline styles overriding the host's
  // default `position: fixed; inset: 0`. Each pane is position: relative, so
  // an absolute child fills it exactly.
  const paneCanvasStyle: Partial<CSSStyleDeclaration> = {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    width: "100%",
    height: "100%",
    zIndex: "0",
    pointerEvents: "none",
  };

  // Each column gets its backend's native camera; the two are kept in
  // lockstep in `tick()` below so visual differences are purely backend-driven.
  const threeCamera = makeCamera(threeBackend);
  const liteCamera = makeCamera(liteBackend);

  let flavor: Flavor = "starfield";
  let threeHost: ThreeSkyboxHost = buildThree(paneThree, threeCamera, flavor);
  let liteHost: LiteSkyboxHost = buildLite(paneLite, liteCamera, flavor);

  // Re-apply pane-scoped canvas styling (constructors already appended canvases
  // with fixed positioning; override here).
  const threeCanvas = document.getElementById("three-skybox-canvas");
  if (threeCanvas) Object.assign(threeCanvas.style, paneCanvasStyle);
  const liteCanvas = document.getElementById("lite-skybox-canvas");
  if (liteCanvas) Object.assign(liteCanvas.style, paneCanvasStyle);

  function rebuildHosts(): void {
    threeHost.destroy();
    liteHost.destroy();
    threeHost = buildThree(paneThree, threeCamera, flavor);
    liteHost = buildLite(paneLite, liteCamera, flavor);
    const tc = document.getElementById("three-skybox-canvas");
    if (tc) Object.assign(tc.style, paneCanvasStyle);
    const lc = document.getElementById("lite-skybox-canvas");
    if (lc) Object.assign(lc.style, paneCanvasStyle);
  }

  toggleBtn.addEventListener("click", () => {
    flavor = flavor === "starfield" ? "gradient" : "starfield";
    setStatus(`flavor: ${flavor}`);
    rebuildHosts();
  });

  loseBtn.addEventListener("click", () => {
    const canvas = liteHost.getCanvas();
    const gl = liteHost.getGl();
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) {
      setStatus("WEBGL_lose_context not available");
      return;
    }
    setStatus("lite context: lost");
    ext.loseContext();
    setTimeout(() => {
      ext.restoreContext();
      setStatus("lite context: restored");
    }, 1000);
    // Reference canvas to silence unused-var warnings in case of future edits.
    void canvas;
  });

  // Slow camera rotation so both columns animate identically. Both cameras
  // are mutated through the structural `PerspectiveCameraLike` surface so
  // the loop body is identical regardless of backend-concrete type.
  function syncCamera(cam: PerspectiveCameraLike, yaw: number, aspect: number): void {
    cam.rotation.set(0, yaw, 0);
    cam.updateMatrixWorld();
    if (cam.aspect !== aspect) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  let last = performance.now();
  let yaw = 0;
  function tick(now: number): void {
    const dt = now - last;
    last = now;
    yaw += dt * 0.0002; // ~0.012 rad/sec, slow drift
    // Both backends update aspect via window resize; ensure each camera's
    // aspect matches the pane aspect (each pane is half the viewport width).
    const aspect = (window.innerWidth / 2) / window.innerHeight;
    syncCamera(threeCamera, yaw, aspect);
    syncCamera(liteCamera, yaw, aspect);
    threeHost.renderFrame(dt);
    liteHost.renderFrame(dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  setStatus(`flavor: ${flavor}`);
});
