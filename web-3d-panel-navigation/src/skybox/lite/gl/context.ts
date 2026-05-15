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

// A <canvas> has TWO independent sizes and both must be set:
//
//   1. Backing-buffer size: `canvas.width` × `canvas.height`. The pixel grid
//      WebGL draws into. We set this in resize.ts to `viewport × DPR` so the
//      output is crisp on HiDPI displays.
//   2. CSS display size: `canvas.style.width` × `canvas.style.height`. How
//      large the element appears on the page. Browsers then scale the backing
//      buffer to fit this box (e.g. a 2880×1011 buffer drawn into a 1920×674
//      CSS box, giving sharp HiDPI output).
//
// For most elements, `position: fixed; inset: 0` with no explicit width/height
// stretches the element to the viewport — width and height are derived from
// the inset values. But <canvas> is a CSS *replaced element* (same category as
// <img> and <video>) with intrinsic dimensions equal to its backing buffer.
// The CSS spec lets browsers fall back to those intrinsic dimensions when
// width/height are `auto`, ignoring inset values. Firefox does exactly that,
// so without an explicit `width`/`height` here the canvas displays at its full
// 2880×1011 backing size, overflows the 1920×674 viewport, and all rendered
// content appears scaled up by the DPR factor — the "zoomed in" bug.
//
// Setting `width: 100%; height: 100%` gives the canvas an explicit CSS size
// that overrides the intrinsic-dimension fallback. With `position: fixed` the
// containing block is the viewport, so `100%` resolves correctly. This matches
// what three.js's WebGLRenderer.setSize() does — it always assigns both the
// backing dimensions AND `canvas.style.width`/`.height` for the same reason.
//
// Symptom if these are removed: lite skybox renders 1.5× larger than three on
// HiDPI displays, content shifted toward the top-left of the viewport. See
// `canvas.getBoundingClientRect()` — it will report the backing-buffer size
// instead of the viewport size.
//
// Full writeup:
// docs/issue-reference/bundle-size-reduction/lite-skybox-canvas-scaling-postmortem.md
const DEFAULT_CANVAS_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "0",
  right: "0",
  bottom: "0",
  width: "100%",
  height: "100%",
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
