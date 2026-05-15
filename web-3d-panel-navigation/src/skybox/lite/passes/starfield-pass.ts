import { linkProgram, getUniform } from "../gl/program";
import { createInterleavedBuffer } from "../gl/buffer";
import type { LinearRgb } from "../css-color";
import type { SkyboxFrame } from "../lite-skybox";

const STAR_RADIUS = 0.95;
const FLOATS_PER_VERTEX = 6; // x, y, z, phase, brightness, tint
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

// Attribute locations are explicit to avoid getAttribLocation() calls and keep
// the bind layout in lockstep with the vertex shader.
const A_POS = 0;
const A_PHASE = 1;
const A_BRIGHTNESS = 2;
const A_TINT = 3;

const VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aPhase;
layout(location = 2) in float aBrightness;
layout(location = 3) in float aTint;
out float vPhase;
out float vBrightness;
out float vTint;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uFovYTan;
uniform float uAspect;
uniform float uBaseSize;
uniform float uPixelRatio;

void main() {
  // Rotation-only view: project star position onto camera basis.
  float vx = dot(aPos, uRight);
  float vy = dot(aPos, uUp);
  float vz = -dot(aPos, uForward); // camera looks down -Z
  float px = vx / (uAspect * uFovYTan);
  float py = vy / uFovYTan;
  // Depth test is disabled for this pass; any positive w is fine. Using -vz
  // as w lets stars in front of the camera pass clip and culls those behind.
  float w = max(-vz, 0.001);
  gl_Position = vec4(px, py, 0.0, w);
  gl_PointSize = uBaseSize * aBrightness * uPixelRatio;
  vPhase = aPhase;
  vBrightness = aBrightness;
  vTint = aTint;
}
`;

const FS = /* glsl */ `#version 300 es
precision mediump float;
in float vPhase;
in float vBrightness;
in float vTint;
uniform vec3 uColorWarm;
uniform vec3 uColorCool;
uniform float uTime;
uniform float uTwinkleFreq;
out vec4 outColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float falloff = smoothstep(0.5, 0.1, length(c));
  float twinkle = 0.7 + 0.3 * sin(uTime * uTwinkleFreq + vPhase);
  float intensity = vBrightness * twinkle * falloff;
  vec3 linear = mix(uColorWarm, uColorCool, vTint) * intensity;
  // See gradient-pass.ts — match three's ShaderMaterial behavior by writing
  // linear values directly without sRGB encoding.
  outColor = vec4(linear, intensity);
}
`;

function buildStarBuffer(count: number): Float32Array {
  const data = new Float32Array(count * FLOATS_PER_VERTEX);
  for (let i = 0; i < count; i++) {
    // Uniform sample on the unit sphere (Marsaglia / "z = 2u-1" method).
    const u = Math.random();
    const v = Math.random();
    const z = 2 * u - 1;
    const phi = 2 * Math.PI * v;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);
    const o = i * FLOATS_PER_VERTEX;
    data[o + 0] = x * STAR_RADIUS;
    data[o + 1] = y * STAR_RADIUS;
    data[o + 2] = z * STAR_RADIUS;
    data[o + 3] = Math.random() * Math.PI * 2;          // phase
    data[o + 4] = 0.5 + Math.random() * 0.5;            // brightness
    // Warm-bias: pow(random, 1.8) skews tint toward 0 (warm) — matches legacy.
    data[o + 5] = Math.pow(Math.random(), 1.8);
  }
  return data;
}

export interface StarfieldPassInputs {
  warm: LinearRgb;
  cool: LinearRgb;
  baseSize: number;
  twinkleFreq: number;
  pixelRatio: number;
}

export interface StarfieldPass {
  setInputs(next: Partial<StarfieldPassInputs>): void;
  setPixelRatio(pixelRatio: number): void;
  render(frame: SkyboxFrame): void;
  dispose(): void;
}

export function createStarfieldPass(
  gl: WebGL2RenderingContext,
  starCount: number,
  initial: StarfieldPassInputs,
): StarfieldPass {
  const program = linkProgram(gl, VS, FS, "starfield");
  const data = buildStarBuffer(starCount);
  const { vao, vbo } = createInterleavedBuffer(
    gl,
    data,
    [
      { location: A_POS, size: 3, offsetBytes: 0 },
      { location: A_PHASE, size: 1, offsetBytes: 12 },
      { location: A_BRIGHTNESS, size: 1, offsetBytes: 16 },
      { location: A_TINT, size: 1, offsetBytes: 20 },
    ],
    BYTES_PER_VERTEX,
  );

  const uForward = getUniform(gl, program, "uForward");
  const uRight = getUniform(gl, program, "uRight");
  const uUp = getUniform(gl, program, "uUp");
  const uFovYTan = getUniform(gl, program, "uFovYTan");
  const uAspect = getUniform(gl, program, "uAspect");
  const uBaseSize = getUniform(gl, program, "uBaseSize");
  const uPixelRatio = getUniform(gl, program, "uPixelRatio");
  const uColorWarm = getUniform(gl, program, "uColorWarm");
  const uColorCool = getUniform(gl, program, "uColorCool");
  const uTime = getUniform(gl, program, "uTime");
  const uTwinkleFreq = getUniform(gl, program, "uTwinkleFreq");

  let inputs = initial;

  return {
    setInputs(next): void {
      inputs = { ...inputs, ...next };
    },
    setPixelRatio(pr): void {
      inputs.pixelRatio = pr;
    },
    render(frame): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform3f(uForward, frame.forward[0], frame.forward[1], frame.forward[2]);
      gl.uniform3f(uRight, frame.right[0], frame.right[1], frame.right[2]);
      gl.uniform3f(uUp, frame.up[0], frame.up[1], frame.up[2]);
      gl.uniform1f(uFovYTan, Math.tan(frame.fovY * 0.5));
      gl.uniform1f(uAspect, frame.aspect);
      gl.uniform1f(uBaseSize, inputs.baseSize);
      gl.uniform1f(uPixelRatio, inputs.pixelRatio);
      gl.uniform3f(uColorWarm, inputs.warm[0], inputs.warm[1], inputs.warm[2]);
      gl.uniform3f(uColorCool, inputs.cool[0], inputs.cool[1], inputs.cool[2]);
      gl.uniform1f(uTime, frame.time * 0.001);
      gl.uniform1f(uTwinkleFreq, inputs.twinkleFreq);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, starCount);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
    dispose(): void {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
