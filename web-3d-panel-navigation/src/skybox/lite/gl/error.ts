export function checkGlError(gl: WebGL2RenderingContext, label: string): void {
  const err = gl.getError();
  if (err !== gl.NO_ERROR) {
    // eslint-disable-next-line no-console
    console.warn(`[skybox-lite] GL error after ${label}: 0x${err.toString(16)}`);
  }
}
