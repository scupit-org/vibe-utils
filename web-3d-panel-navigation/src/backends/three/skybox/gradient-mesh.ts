import { Mesh, Color, BoxGeometry, ShaderMaterial, BackSide, Vector3 } from "three";
import { readCssColor } from "./css-color";

export interface GradientMeshOptions {
  colors?: [string, string, string];
  direction?: [number, number, number];
  cssVarNames?: [string, string, string];
  fallbackColors?: [string, string, string];
}

export interface GradientMesh {
  mesh: Mesh;
  refresh(): void;
  dispose(): void;
}

const DEFAULT_CSS_VAR_NAMES: [string, string, string] = [
  "--skybox-color-a",
  "--skybox-color-b",
  "--skybox-color-c",
];
const DEFAULT_FALLBACK_COLORS: [string, string, string] = ["#2a1a10", "#3d2414", "#5c3420"];
const DEFAULT_DIRECTION: [number, number, number] = [1.0, 0.6, 0.4];

export const GRADIENT_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GRADIENT_FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uDirection;
  varying vec3 vDirection;

  void main() {
    float t = dot(normalize(vDirection), normalize(uDirection)) * 0.5 + 0.5;
    vec3 color = t < 0.5
      ? mix(uColorA, uColorB, t * 2.0)
      : mix(uColorB, uColorC, (t - 0.5) * 2.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createGradientMesh(options: GradientMeshOptions = {}): GradientMesh {
  const cssVarNames = options.cssVarNames ?? DEFAULT_CSS_VAR_NAMES;
  const fallbacks = options.fallbackColors ?? DEFAULT_FALLBACK_COLORS;
  const direction = options.direction ?? DEFAULT_DIRECTION;

  const resolveColors = (): [Color, Color, Color] => {
    if (options.colors) {
      return [
        new Color(options.colors[0]),
        new Color(options.colors[1]),
        new Color(options.colors[2]),
      ];
    }
    return [
      readCssColor(cssVarNames[0], fallbacks[0]),
      readCssColor(cssVarNames[1], fallbacks[1]),
      readCssColor(cssVarNames[2], fallbacks[2]),
    ];
  };

  const [initA, initB, initC] = resolveColors();

  const geometry = new BoxGeometry(2, 2, 2);
  const material = new ShaderMaterial({
    vertexShader: GRADIENT_VERTEX_SHADER,
    fragmentShader: GRADIENT_FRAGMENT_SHADER,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uColorA: { value: initA },
      uColorB: { value: initB },
      uColorC: { value: initC },
      uDirection: { value: new Vector3(direction[0], direction[1], direction[2]) },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;

  return {
    mesh,
    refresh(): void {
      const [a, b, c] = resolveColors();
      (material.uniforms.uColorA.value as Color).copy(a);
      (material.uniforms.uColorB.value as Color).copy(b);
      (material.uniforms.uColorC.value as Color).copy(c);
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
