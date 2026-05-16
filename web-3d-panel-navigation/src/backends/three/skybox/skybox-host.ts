import { PerspectiveCamera, WebGLRenderer, Scene, type ColorRepresentation } from "three";
import type { Skybox } from "./skybox";

export interface SkyboxHostOptions {
  camera: PerspectiveCamera;
  mount: HTMLElement;
  skybox: Skybox;
  canvasId?: string;
  clearColor?: ColorRepresentation;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  antialias?: boolean;
  powerPreference?: WebGLPowerPreference;
  pixelRatio?: number | ((devicePixelRatio: number) => number);
  autoStart?: boolean;
  externalFrameLoop?: boolean;
}

const DEFAULT_CLEAR_COLOR: ColorRepresentation = 0x000000;

const DEFAULT_CANVAS_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "0",
  right: "0",
  bottom: "0",
  zIndex: "0",
  pointerEvents: "none",
  display: "block",
};

export class SkyboxHost {
  private readonly camera: PerspectiveCamera;
  private readonly mount: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private skybox: Skybox;
  private pixelRatio: number;
  private readonly pixelRatioOption: SkyboxHostOptions["pixelRatio"];
  private readonly externalFrameLoop: boolean;

  private frameId: number | null = null;
  private lastTime = 0;
  private userIntendedRunning = false;

  private readonly boundTick: () => void;
  private readonly boundResize: () => void;
  private readonly boundVisibility: () => void;

  constructor(options: SkyboxHostOptions) {
    this.camera = options.camera;
    this.mount = options.mount;
    this.skybox = options.skybox;
    this.pixelRatioOption = options.pixelRatio;
    this.externalFrameLoop = options.externalFrameLoop ?? false;

    this.renderer = new WebGLRenderer({
      antialias: options.antialias ?? false,
      alpha: false,
      powerPreference: options.powerPreference ?? "default",
    });
    this.pixelRatio = this.resolvePixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(options.clearColor ?? DEFAULT_CLEAR_COLOR, 1);

    const canvas = this.renderer.domElement;
    canvas.id = options.canvasId ?? "skybox-canvas";
    Object.assign(canvas.style, DEFAULT_CANVAS_STYLE, options.canvasStyle ?? {});
    this.mount.appendChild(canvas);

    this.scene = new Scene();
    this.scene.add(this.skybox.root);
    this.skybox.attach?.(this.scene);
    this.skybox.setPixelRatio?.(this.pixelRatio);

    this.boundTick = () => this.tick();
    this.boundResize = () => this.handleResize();
    this.boundVisibility = () => this.handleVisibilityChange();
    window.addEventListener("resize", this.boundResize);
    document.addEventListener("visibilitychange", this.boundVisibility);

    if (options.autoStart) {
      this.start();
    }
  }

  start(): void {
    this.userIntendedRunning = true;
    if (this.externalFrameLoop) return;
    if (this.frameId !== null) return;
    if (document.hidden) return;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.boundTick);
  }

  stop(): void {
    this.userIntendedRunning = false;
    this.cancelLoop();
  }

  setSkybox(next: Skybox): void {
    this.skybox.detach?.(this.scene);
    this.scene.remove(this.skybox.root);
    this.skybox.dispose();
    this.skybox = next;
    this.scene.add(next.root);
    next.attach?.(this.scene);
    next.setPixelRatio?.(this.pixelRatio);
  }

  setPixelRatio(pixelRatio?: SkyboxHostOptions["pixelRatio"]): void {
    this.pixelRatio = this.resolvePixelRatio(pixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.skybox.setPixelRatio?.(this.pixelRatio);
    this.handleResize();
  }

  renderFrame(dt = 0): void {
    if (document.hidden) return;
    this.skybox.update?.(dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  refresh(): void {
    this.skybox.refresh?.();
  }

  destroy(): void {
    this.stop();
    window.removeEventListener("resize", this.boundResize);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    this.skybox.detach?.(this.scene);
    this.scene.remove(this.skybox.root);
    this.skybox.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
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
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.cancelLoop();
    } else if (this.userIntendedRunning && this.frameId === null && !this.externalFrameLoop) {
      this.lastTime = performance.now();
      this.frameId = requestAnimationFrame(this.boundTick);
    }
  }

  private resolvePixelRatio(pixelRatio = this.pixelRatioOption): number {
    const resolved = typeof pixelRatio === "function"
      ? pixelRatio(window.devicePixelRatio)
      : pixelRatio ?? Math.min(window.devicePixelRatio, 1.5);

    return Math.max(0.1, resolved);
  }

  private cancelLoop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}
