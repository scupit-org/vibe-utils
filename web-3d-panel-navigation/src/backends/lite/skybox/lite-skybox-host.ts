import type { PerspectiveCamera } from "../scene";
import { createLiteCanvas } from "./gl/context";
import { resolvePixelRatio, resizeCanvas } from "./gl/resize";
import type { LiteSkybox, LiteSkyboxHostOptions, SkyboxFrame } from "./lite-skybox";

function parseClearColor(value: number | string | undefined): [number, number, number] {
  if (typeof value === "number") {
    return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
  }
  if (typeof value === "string") {
    const m = /^#([0-9a-f]{6})$/i.exec(value.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    }
  }
  return [0, 0, 0];
}

export class LiteSkyboxHost {
  private readonly camera: PerspectiveCamera;
  private readonly mount: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private skybox: LiteSkybox;
  private pixelRatio: number;
  private readonly pixelRatioOption: LiteSkyboxHostOptions["pixelRatio"];
  private readonly externalFrameLoop: boolean;
  private readonly clearColor: [number, number, number];

  private frameId: number | null = null;
  private lastTime = 0;
  private elapsed = 0;
  private startTime = 0;
  private userIntendedRunning = false;
  private contextLost = false;
  private cachedFrame: SkyboxFrame;

  private readonly boundTick: () => void;
  private readonly boundResize: () => void;
  private readonly boundVisibility: () => void;
  private readonly boundContextLost: (e: Event) => void;
  private readonly boundContextRestored: () => void;

  constructor(options: LiteSkyboxHostOptions) {
    this.camera = options.camera;
    this.mount = options.mount;
    this.skybox = options.skybox;
    this.pixelRatioOption = options.pixelRatio;
    this.externalFrameLoop = options.externalFrameLoop ?? false;
    this.clearColor = parseClearColor(options.clearColor ?? 0x000000);

    const { canvas, gl } = createLiteCanvas({
      mount: options.mount,
      canvasId: options.canvasId,
      canvasStyle: options.canvasStyle,
      antialias: options.antialias,
      powerPreference: options.powerPreference,
    });
    this.canvas = canvas;
    this.gl = gl;

    this.pixelRatio = resolvePixelRatio(this.pixelRatioOption);
    const sized = resizeCanvas(this.gl, this.canvas, this.pixelRatio);
    this.cachedFrame = this.makeFrame(sized.widthCss, sized.heightCss, sized.widthPx, sized.heightPx, 0);

    this.skybox.init(this.gl);
    this.skybox.setPixelRatio?.(this.pixelRatio);

    this.boundTick = () => this.tick();
    this.boundResize = () => this.handleResize();
    this.boundVisibility = () => this.handleVisibilityChange();
    this.boundContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.boundContextRestored = () => {
      this.contextLost = false;
      // Per WebGL spec, all previously created GL resources are invalid after
      // restore. Tear down and reinitialize the active skybox.
      try {
        this.skybox.dispose();
      } catch {
        // Disposing an already-invalid skybox is best-effort.
      }
      this.skybox.init(this.gl);
      this.skybox.setPixelRatio?.(this.pixelRatio);
      this.handleResize();
    };

    window.addEventListener("resize", this.boundResize);
    document.addEventListener("visibilitychange", this.boundVisibility);
    canvas.addEventListener("webglcontextlost", this.boundContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.boundContextRestored, false);

    if (options.autoStart) {
      this.start();
    }
  }

  start(): void {
    this.userIntendedRunning = true;

    if (this.externalFrameLoop || this.frameId !== null || document.hidden) return;

    const now = performance.now();
    this.lastTime = now;

    if (this.startTime === 0) {
      this.startTime = now;
    }

    this.frameId = requestAnimationFrame(this.boundTick);
  }

  stop(): void {
    this.userIntendedRunning = false;
    this.cancelLoop();
  }

  setSkybox(next: LiteSkybox): void {
    try {
      this.skybox.dispose();
    } catch {
      // best-effort
    }
    this.skybox = next;
    next.init(this.gl);
    next.setPixelRatio?.(this.pixelRatio);
  }

  setPixelRatio(pixelRatio?: LiteSkyboxHostOptions["pixelRatio"]): void {
    this.pixelRatio = resolvePixelRatio(pixelRatio ?? this.pixelRatioOption);
    this.skybox.setPixelRatio?.(this.pixelRatio);
    this.handleResize();
  }

  renderFrame(dt = 0): void {
    if (document.hidden || this.contextLost) return;
    this.elapsed += dt;
    const frame = this.updateFrame(dt);
    const gl = this.gl;
    gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.skybox.render(frame);
  }

  refresh(): void {
    this.skybox.refresh?.();
  }

  destroy(): void {
    this.stop();
    window.removeEventListener("resize", this.boundResize);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.boundContextLost, false);
    this.canvas.removeEventListener("webglcontextrestored", this.boundContextRestored, false);
    try {
      this.skybox.dispose();
    } catch {
      // best-effort
    }
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  /** Exposed for the visual-parity harness so it can drive context loss for testing. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Exposed for the visual-parity harness; consumers should not depend on this. */
  getGl(): WebGL2RenderingContext {
    return this.gl;
  }

  private tick(): void {
    this.frameId = null;
    if (!this.userIntendedRunning || document.hidden || this.externalFrameLoop) {
      return;
    }
    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;
    this.renderFrame(dt);
    this.frameId = requestAnimationFrame(this.boundTick);
  }

  private handleResize(): void {
    const sized = resizeCanvas(this.gl, this.canvas, this.pixelRatio);
    this.cachedFrame.widthCss = sized.widthCss;
    this.cachedFrame.heightCss = sized.heightCss;
    this.cachedFrame.widthPx = sized.widthPx;
    this.cachedFrame.heightPx = sized.heightPx;
    // aspect is driven by camera.aspect (refreshed every frame in updateFrame),
    // not by the canvas dimensions — see updateFrame() for the rationale.
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.cancelLoop();
    } else if (
      this.userIntendedRunning &&
      this.frameId === null &&
      !this.externalFrameLoop
    ) {
      this.lastTime = performance.now();
      this.frameId = requestAnimationFrame(this.boundTick);
    }
  }

  private cancelLoop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private makeFrame(
    widthCss: number,
    heightCss: number,
    widthPx: number,
    heightPx: number,
    dt: number,
  ): SkyboxFrame {
    return {
      widthCss,
      heightCss,
      widthPx,
      heightPx,
      fovY: (this.camera.fov * Math.PI) / 180,
      // Use camera.aspect (not canvas aspect). See updateFrame() for the
      // rationale; we keep both reads in sync.
      aspect: this.camera.aspect,
      time: this.elapsed,
      dt,
      forward: [0, 0, -1],
      right: [1, 0, 0],
      up: [0, 1, 0],
    };
  }

  private updateFrame(dt: number): SkyboxFrame {
    // Three guarantees matrixWorld is up-to-date when WebGLRenderer.render is
    // called. The lite host can't rely on that — derive matrixWorld now.
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    // Camera looks down -Z, so column 2 (back basis) negated = forward.
    const rx = e[0], ry = e[1], rz = e[2];
    const ux = e[4], uy = e[5], uz = e[6];
    const fx = -e[8], fy = -e[9], fz = -e[10];

    const f = this.cachedFrame;
    f.fovY = (this.camera.fov * Math.PI) / 180;
    // Drive the horizontal FOV from camera.aspect, not from the canvas
    // dimensions. This matches three's WebGLRenderer (it reads the projection
    // matrix off the camera, which the user owns) and lets consumers point a
    // camera at a region whose aspect differs from the canvas — split views,
    // picture-in-picture, etc. If you ever want to instead force the
    // projection to match the actual canvas dimensions (e.g. a fullscreen
    // skybox where you don't want to require the caller to keep camera.aspect
    // in sync on resize), swap this back to:
    //   f.aspect = f.widthCss / Math.max(1, f.heightCss);
    // and remove the camera.aspect read.
    f.aspect = this.camera.aspect;
    f.time = this.elapsed;
    f.dt = dt;
    f.forward[0] = fx; f.forward[1] = fy; f.forward[2] = fz;
    f.right[0] = rx;   f.right[1] = ry;   f.right[2] = rz;
    f.up[0] = ux;      f.up[1] = uy;      f.up[2] = uz;
    return f;
  }
}
