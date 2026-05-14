export type PixelRatioOption = number | ((devicePixelRatio: number) => number) | undefined;

export function resolvePixelRatio(option: PixelRatioOption): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const resolved =
    typeof option === "function" ? option(dpr) : option ?? Math.min(dpr, 1.5);
  return Math.max(0.1, resolved);
}

export interface ResizeResult {
  widthCss: number;
  heightCss: number;
  widthPx: number;
  heightPx: number;
}

export function resizeCanvas(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  pixelRatio: number,
): ResizeResult {
  const widthCss = window.innerWidth;
  const heightCss = window.innerHeight;
  const desiredW = Math.max(1, Math.floor(widthCss * pixelRatio));
  const desiredH = Math.max(1, Math.floor(heightCss * pixelRatio));
  if (canvas.width !== desiredW) canvas.width = desiredW;
  if (canvas.height !== desiredH) canvas.height = desiredH;
  // Use drawingBuffer dimensions (may differ from requested) for the viewport.
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  return {
    widthCss,
    heightCss,
    widthPx: gl.drawingBufferWidth,
    heightPx: gl.drawingBufferHeight,
  };
}
