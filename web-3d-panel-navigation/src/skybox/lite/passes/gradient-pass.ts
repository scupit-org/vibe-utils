import { linkProgram, getUniform } from "../gl/program";
import { createEmptyVAO } from "../gl/buffer";
import type { LinearRgb } from "../css-color";
import type { SkyboxFrame } from "../lite-skybox";

const VS = /* glsl */ `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID — no VBO needed.
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FS = /* glsl */ `#version 300 es
precision mediump float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uDirection;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uResolution;
uniform float uFovYTan;
uniform float uAspect;
out vec4 outColor;

void main() {
  vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  vec3 rayDir = normalize(
    uForward
      + uRight * (ndc.x * uFovYTan * uAspect)
      + uUp    * (ndc.y * uFovYTan)
  );
  float t = dot(rayDir, normalize(uDirection)) * 0.5 + 0.5;
  vec3 linear = t < 0.5
    ? mix(uColorA, uColorB, t * 2.0)
    : mix(uColorB, uColorC, (t - 0.5) * 2.0);
  vec3 srgb = pow(linear, vec3(1.0 / 2.2));
  outColor = vec4(srgb, 1.0);
}
`;

export interface GradientPassInputs {
  /** Linear-space RGB. */
  colorA: LinearRgb;
  colorB: LinearRgb;
  colorC: LinearRgb;
  direction: [number, number, number];
}

export interface GradientPass {
  /** Update color/direction inputs (call after refresh()). */
  setInputs(inputs: GradientPassInputs): void;
  render(frame: SkyboxFrame): void;
  dispose(): void;
}

export function createGradientPass(
  gl: WebGL2RenderingContext,
  initial: GradientPassInputs,
): GradientPass {
  const program = linkProgram(gl, VS, FS, "gradient");
  const vao = createEmptyVAO(gl);

  const uColorA = getUniform(gl, program, "uColorA");
  const uColorB = getUniform(gl, program, "uColorB");
  const uColorC = getUniform(gl, program, "uColorC");
  const uDirection = getUniform(gl, program, "uDirection");
  const uForward = getUniform(gl, program, "uForward");
  const uRight = getUniform(gl, program, "uRight");
  const uUp = getUniform(gl, program, "uUp");
  const uResolution = getUniform(gl, program, "uResolution");
  const uFovYTan = getUniform(gl, program, "uFovYTan");
  const uAspect = getUniform(gl, program, "uAspect");

  let inputs = initial;

  return {
    setInputs(next): void {
      inputs = next;
    },
    render(frame): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform3f(uColorA, inputs.colorA[0], inputs.colorA[1], inputs.colorA[2]);
      gl.uniform3f(uColorB, inputs.colorB[0], inputs.colorB[1], inputs.colorB[2]);
      gl.uniform3f(uColorC, inputs.colorC[0], inputs.colorC[1], inputs.colorC[2]);
      gl.uniform3f(uDirection, inputs.direction[0], inputs.direction[1], inputs.direction[2]);
      gl.uniform3f(uForward, frame.forward[0], frame.forward[1], frame.forward[2]);
      gl.uniform3f(uRight, frame.right[0], frame.right[1], frame.right[2]);
      gl.uniform3f(uUp, frame.up[0], frame.up[1], frame.up[2]);
      gl.uniform2f(uResolution, frame.widthPx, frame.heightPx);
      gl.uniform1f(uFovYTan, Math.tan(frame.fovY * 0.5));
      gl.uniform1f(uAspect, frame.aspect);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    dispose(): void {
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
