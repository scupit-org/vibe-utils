import type { LiteSkybox, SkyboxFrame } from "../lite-skybox";
import { createGradientPass, type GradientPass, type GradientPassInputs } from "../passes/gradient-pass";
import { parseColorToLinear, readCssColor, type LinearRgb } from "../css-color";

export interface GradientSkyboxOptions {
  colors?: [string, string, string];
  direction?: [number, number, number];
  cssVarNames?: [string, string, string];
  fallbackColors?: [string, string, string];
}

const DEFAULT_CSS_VAR_NAMES: [string, string, string] = [
  "--skybox-color-a",
  "--skybox-color-b",
  "--skybox-color-c",
];
const DEFAULT_FALLBACK_COLORS: [string, string, string] = ["#2a1a10", "#3d2414", "#5c3420"];
const DEFAULT_DIRECTION: [number, number, number] = [1.0, 0.6, 0.4];

export function createGradientSkybox(options: GradientSkyboxOptions = {}): LiteSkybox {
  const cssVarNames = options.cssVarNames ?? DEFAULT_CSS_VAR_NAMES;
  const fallbacks = options.fallbackColors ?? DEFAULT_FALLBACK_COLORS;
  const direction = options.direction ?? DEFAULT_DIRECTION;

  const resolveColors = (): [LinearRgb, LinearRgb, LinearRgb] => {
    if (options.colors) {
      return [
        parseColorToLinear(options.colors[0]),
        parseColorToLinear(options.colors[1]),
        parseColorToLinear(options.colors[2]),
      ];
    }
    return [
      readCssColor(cssVarNames[0], fallbacks[0]),
      readCssColor(cssVarNames[1], fallbacks[1]),
      readCssColor(cssVarNames[2], fallbacks[2]),
    ];
  };

  let pass: GradientPass | null = null;
  let inputs: GradientPassInputs = (() => {
    const [a, b, c] = resolveColors();
    return { colorA: a, colorB: b, colorC: c, direction };
  })();

  return {
    init(gl): void {
      pass = createGradientPass(gl, inputs);
    },
    render(frame: SkyboxFrame): void {
      if (!pass) return;
      pass.render(frame);
    },
    refresh(): void {
      const [a, b, c] = resolveColors();
      inputs = { colorA: a, colorB: b, colorC: c, direction: inputs.direction };
      pass?.setInputs(inputs);
    },
    dispose(): void {
      pass?.dispose();
      pass = null;
    },
  };
}
