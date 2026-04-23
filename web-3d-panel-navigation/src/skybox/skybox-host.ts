import * as THREE from "three";
import type { Skybox } from "./skybox";

export interface SkyboxHostOptions {
  camera: THREE.PerspectiveCamera;
  mount: HTMLElement;
  skybox: Skybox;
  canvasId?: string;
  clearColor?: THREE.ColorRepresentation;
  canvasStyle?: Partial<CSSStyleDeclaration>;
}

const DEFAULT_CLEAR_COLOR: THREE.ColorRepresentation = 0x000000;

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
  private readonly camera: THREE.PerspectiveCamera;
  private readonly mount: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private skybox: Skybox;

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

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(options.clearColor ?? DEFAULT_CLEAR_COLOR, 1);

    const canvas = this.renderer.domElement;
    canvas.id = options.canvasId ?? "skybox-canvas";
    Object.assign(canvas.style, DEFAULT_CANVAS_STYLE, options.canvasStyle ?? {});
    this.mount.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.add(this.skybox.root);
    this.skybox.attach?.(this.scene);

    this.boundTick = () => this.tick();
    this.boundResize = () => this.handleResize();
    this.boundVisibility = () => this.handleVisibilityChange();
    window.addEventListener("resize", this.boundResize);
    document.addEventListener("visibilitychange", this.boundVisibility);
  }

  start(): void {
    this.userIntendedRunning = true;
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
    this.frameId = requestAnimationFrame(this.boundTick);

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.skybox.update?.(dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.cancelLoop();
    } else if (this.userIntendedRunning && this.frameId === null) {
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
}
