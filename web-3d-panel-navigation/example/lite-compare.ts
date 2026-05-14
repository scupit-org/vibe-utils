import { PerspectiveCamera } from "three";
import {
  SkyboxHost,
  createGradientSkybox as createGradientSkyboxThree,
  createStarfieldSkybox as createStarfieldSkyboxThree,
} from "../dist/index.js";
import {
  LiteSkyboxHost,
  createGradientSkybox as createGradientSkyboxLite,
  createStarfieldSkybox as createStarfieldSkyboxLite,
} from "../dist/skybox-lite.js";

type Flavor = "gradient" | "starfield";

function makeCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -1);
  return cam;
}

function buildThree(mount: HTMLElement, camera: PerspectiveCamera, flavor: Flavor): SkyboxHost {
  const skybox = flavor === "gradient" ? createGradientSkyboxThree() : createStarfieldSkyboxThree();
  return new SkyboxHost({ camera, mount, skybox, canvasId: "three-skybox-canvas", autoStart: false });
}

function buildLite(mount: HTMLElement, camera: PerspectiveCamera, flavor: Flavor): LiteSkyboxHost {
  const skybox = flavor === "gradient" ? createGradientSkyboxLite() : createStarfieldSkyboxLite();
  return new LiteSkyboxHost({ camera, mount, skybox, canvasId: "lite-skybox-canvas", autoStart: false });
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

  // Both columns share a camera so visual differences are purely backend-driven.
  const camera = makeCamera();

  let flavor: Flavor = "starfield";
  let threeHost: SkyboxHost = buildThree(paneThree, camera, flavor);
  let liteHost: LiteSkyboxHost = buildLite(paneLite, camera, flavor);

  // Re-apply pane-scoped canvas styling (constructors already appended canvases
  // with fixed positioning; override here).
  const threeCanvas = document.getElementById("three-skybox-canvas");
  if (threeCanvas) Object.assign(threeCanvas.style, paneCanvasStyle);
  const liteCanvas = document.getElementById("lite-skybox-canvas");
  if (liteCanvas) Object.assign(liteCanvas.style, paneCanvasStyle);

  function rebuildHosts(): void {
    threeHost.destroy();
    liteHost.destroy();
    threeHost = buildThree(paneThree, camera, flavor);
    liteHost = buildLite(paneLite, camera, flavor);
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

  // Slow camera rotation so both columns animate identically.
  let last = performance.now();
  let yaw = 0;
  function tick(now: number): void {
    const dt = now - last;
    last = now;
    yaw += dt * 0.0002; // ~0.012 rad/sec, slow drift
    camera.rotation.set(0, yaw, 0);
    camera.updateMatrixWorld();
    // Both backends update aspect via window resize; ensure the camera aspect
    // matches the pane aspect (each pane is half the viewport width).
    const aspect = (window.innerWidth / 2) / window.innerHeight;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    threeHost.renderFrame(dt);
    liteHost.renderFrame(dt);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  setStatus(`flavor: ${flavor}`);
});
