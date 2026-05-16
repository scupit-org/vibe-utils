import type { PerspectiveCamera } from "../scene";

export interface SkyboxFrame {
  /** CSS pixel viewport size (matches canvas style width/height). */
  widthCss: number;
  heightCss: number;
  /** Backing-buffer pixel size (CSS * clamped DPR). */
  widthPx: number;
  heightPx: number;
  /** Vertical field of view in radians. */
  fovY: number;
  /** widthCss / heightCss. */
  aspect: number;
  /** Monotonic ms since host start (animation clock). */
  time: number;
  /** ms since last frame. */
  dt: number;
  /** Camera basis in world space. Normalized. */
  forward: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
}

export interface LiteSkybox {
  /**
   * Called once after the host owns a context. Compile shaders, upload buffers,
   * allocate textures. Throw on unrecoverable setup failure.
   */
  init(gl: WebGL2RenderingContext): void;
  /** Issue draw calls. */
  render(frame: SkyboxFrame): void;
  /** Re-read CSS-variable inputs. Optional. */
  refresh?(): void;
  /** Update DPR-dependent uniforms (e.g. starfield gl_PointSize). Optional. */
  setPixelRatio?(pixelRatio: number): void;
  /** Release GL resources. After dispose() the host treats this object as dead. */
  dispose(): void;
}

export interface LiteSkyboxHostOptions {
  camera: PerspectiveCamera;
  mount: HTMLElement;
  skybox: LiteSkybox;
  canvasId?: string;
  /** Canvas clear color; accepts 0xRRGGBB or any CSS color string. Default black. */
  clearColor?: number | string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  antialias?: boolean;
  powerPreference?: WebGLPowerPreference;
  pixelRatio?: number | ((devicePixelRatio: number) => number);
  autoStart?: boolean;
  externalFrameLoop?: boolean;
}
