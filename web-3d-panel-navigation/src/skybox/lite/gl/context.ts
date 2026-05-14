export interface CreateLiteCanvasOptions {
  mount: HTMLElement;
  canvasId?: string;
  canvasStyle?: Partial<CSSStyleDeclaration>;
  antialias?: boolean;
  powerPreference?: WebGLPowerPreference;
}

export interface LiteCanvas {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
}

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

export function createLiteCanvas(options: CreateLiteCanvasOptions): LiteCanvas {
  const canvas = document.createElement("canvas");
  canvas.id = options.canvasId ?? "skybox-lite-canvas";
  Object.assign(canvas.style, DEFAULT_CANVAS_STYLE, options.canvasStyle ?? {});

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: options.antialias ?? false,
    powerPreference: options.powerPreference ?? "default",
    preserveDrawingBuffer: false,
    depth: false,
    stencil: false,
  }) as WebGL2RenderingContext | null;

  if (!gl) {
    throw new Error(
      "LiteSkyboxHost: WebGL2 is not available. Fall back to the three-backed SkyboxHost from " +
        "@scupit/web-3d-panel-navigation if WebGL2 cannot be guaranteed in your target environment.",
    );
  }

  options.mount.appendChild(canvas);
  return { canvas, gl };
}
