export interface AttribSpec {
  location: number;
  size: number;          // components per vertex (1..4)
  offsetBytes: number;
}

export function createInterleavedBuffer(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  attribs: AttribSpec[],
  strideBytes: number,
): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer } {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("Failed to allocate VAO/VBO");

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  for (const a of attribs) {
    gl.enableVertexAttribArray(a.location);
    gl.vertexAttribPointer(a.location, a.size, gl.FLOAT, false, strideBytes, a.offsetBytes);
  }

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return { vao, vbo };
}

export function createEmptyVAO(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("Failed to allocate empty VAO");
  return vao;
}
