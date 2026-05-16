import { Vector3, BufferGeometry, BufferAttribute, Color, ShaderMaterial, AdditiveBlending, Points, Group } from "three";
import type { Skybox } from "./skybox";
import { createGradientMesh, type GradientMeshOptions } from "./gradient-mesh";
import { readCssColor } from "./css-color";

export interface StarfieldSkyboxOptions {
  starCount?: number;
  color?: string;
  colorCool?: string;
  baseSize?: number;
  twinkleFreq?: number;
  pixelRatio?: number;
  gradient?: GradientMeshOptions;
}

const STAR_WARM_VAR = "--skybox-star-color";
const STAR_WARM_FALLBACK = "#ffe6c8";
const STAR_COOL_VAR = "--skybox-star-color-cool";
const STAR_COOL_FALLBACK = "#b5c9ff";
const DEFAULT_STAR_COUNT = 2500;
const DEFAULT_BASE_SIZE = 3.5;
const DEFAULT_TWINKLE_FREQ = 1.5;
const STAR_RADIUS = 0.95;

export const STARFIELD_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aBrightness;
  attribute float aTint;
  varying float vPhase;
  varying float vBrightness;
  varying float vTint;
  uniform float uBaseSize;
  uniform float uPixelRatio;

  void main() {
    vPhase = aPhase;
    vBrightness = aBrightness;
    vTint = aTint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uBaseSize * aBrightness * uPixelRatio;
  }
`;

export const STARFIELD_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorWarm;
  uniform vec3 uColorCool;
  uniform float uTime;
  uniform float uTwinkleFreq;
  varying float vPhase;
  varying float vBrightness;
  varying float vTint;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    float falloff = smoothstep(0.5, 0.1, dist);
    float twinkle = 0.7 + 0.3 * sin(uTime * uTwinkleFreq + vPhase);
    float intensity = vBrightness * twinkle * falloff;
    vec3 color = mix(uColorWarm, uColorCool, vTint);
    gl_FragColor = vec4(color * intensity, intensity);
  }
`;

function samplePointOnUnitSphere(out: Vector3): void {
  const u = Math.random();
  const v = Math.random();
  const z = 2 * u - 1;
  const phi = 2 * Math.PI * v;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  out.set(r * Math.cos(phi), r * Math.sin(phi), z);
}

function buildStarGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const brightnesses = new Float32Array(count);
  const tints = new Float32Array(count);
  const scratch = new Vector3();

  for (let i = 0; i < count; i++) {
    samplePointOnUnitSphere(scratch);
    positions[i * 3 + 0] = scratch.x * STAR_RADIUS;
    positions[i * 3 + 1] = scratch.y * STAR_RADIUS;
    positions[i * 3 + 2] = scratch.z * STAR_RADIUS;
    phases[i] = Math.random() * Math.PI * 2;
    brightnesses[i] = 0.5 + Math.random() * 0.5;
    // Bias the palette toward the warm end — a few cool stars stand out
    // more than a 50/50 mix would.
    tints[i] = Math.pow(Math.random(), 1.8);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.setAttribute("aBrightness", new BufferAttribute(brightnesses, 1));
  geometry.setAttribute("aTint", new BufferAttribute(tints, 1));
  return geometry;
}

export function createStarfieldSkybox(options: StarfieldSkyboxOptions = {}): Skybox {
  const starCount = options.starCount ?? DEFAULT_STAR_COUNT;
  const baseSize = options.baseSize ?? DEFAULT_BASE_SIZE;
  const twinkleFreq = options.twinkleFreq ?? DEFAULT_TWINKLE_FREQ;
  const pixelRatio = options.pixelRatio ?? Math.min(window.devicePixelRatio, 1.5);

  const gradient = createGradientMesh(options.gradient);

  const resolveWarm = (): Color =>
    options.color
      ? new Color(options.color)
      : readCssColor(STAR_WARM_VAR, STAR_WARM_FALLBACK);

  const resolveCool = (): Color =>
    options.colorCool
      ? new Color(options.colorCool)
      : readCssColor(STAR_COOL_VAR, STAR_COOL_FALLBACK);

  const starGeometry = buildStarGeometry(starCount);
  const starMaterial = new ShaderMaterial({
    vertexShader: STARFIELD_VERTEX_SHADER,
    fragmentShader: STARFIELD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uColorWarm: { value: resolveWarm() },
      uColorCool: { value: resolveCool() },
      uTime: { value: 0 },
      uTwinkleFreq: { value: twinkleFreq },
      uBaseSize: { value: baseSize },
      uPixelRatio: { value: pixelRatio },
    },
  });

  const starPoints = new Points(starGeometry, starMaterial);
  starPoints.renderOrder = 0;
  starPoints.frustumCulled = false;

  const group = new Group();
  group.add(gradient.mesh);
  group.add(starPoints);

  let elapsed = 0;

  return {
    root: group,
    update(dt, camera) {
      elapsed += dt;
      starMaterial.uniforms.uTime.value = elapsed * 0.001;
      group.position.copy(camera.position);
    },
    setPixelRatio(nextPixelRatio) {
      starMaterial.uniforms.uPixelRatio.value = nextPixelRatio;
    },
    refresh() {
      gradient.refresh();
      (starMaterial.uniforms.uColorWarm.value as Color).copy(resolveWarm());
      (starMaterial.uniforms.uColorCool.value as Color).copy(resolveCool());
    },
    dispose() {
      gradient.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
