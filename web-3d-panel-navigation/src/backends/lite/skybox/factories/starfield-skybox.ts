import type { LiteSkybox, SkyboxFrame } from "../lite-skybox";
import { createStarfieldPass, type StarfieldPass } from "../passes/starfield-pass";
import { parseColorToLinear, readCssColor, type LinearRgb } from "../css-color";
import { createGradientSkybox, type GradientSkyboxOptions } from "./gradient-skybox";

export interface StarfieldSkyboxOptions {
  starCount?: number;
  /** Override the warm star color (defaults to CSS var --skybox-star-color). */
  color?: string;
  /** Override the cool star color (defaults to CSS var --skybox-star-color-cool). */
  colorCool?: string;
  baseSize?: number;
  twinkleFreq?: number;
  pixelRatio?: number;
  gradient?: GradientSkyboxOptions;
}

const STAR_WARM_VAR = "--skybox-star-color";
const STAR_WARM_FALLBACK = "#ffe6c8";
const STAR_COOL_VAR = "--skybox-star-color-cool";
const STAR_COOL_FALLBACK = "#b5c9ff";
const DEFAULT_STAR_COUNT = 2500;
const DEFAULT_BASE_SIZE = 3.5;
const DEFAULT_TWINKLE_FREQ = 1.5;

export function createStarfieldSkybox(options: StarfieldSkyboxOptions = {}): LiteSkybox {
  const starCount = options.starCount ?? DEFAULT_STAR_COUNT;
  const baseSize = options.baseSize ?? DEFAULT_BASE_SIZE;
  const twinkleFreq = options.twinkleFreq ?? DEFAULT_TWINKLE_FREQ;
  // Initial pixelRatio is the constructor-time best guess; the host will
  // override it via setPixelRatio() before the first render.
  const initialPixelRatio =
    options.pixelRatio ??
    (typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1);

  const gradient = createGradientSkybox(options.gradient);

  const resolveWarm = (): LinearRgb =>
    options.color
      ? parseColorToLinear(options.color)
      : readCssColor(STAR_WARM_VAR, STAR_WARM_FALLBACK);

  const resolveCool = (): LinearRgb =>
    options.colorCool
      ? parseColorToLinear(options.colorCool)
      : readCssColor(STAR_COOL_VAR, STAR_COOL_FALLBACK);

  let pass: StarfieldPass | null = null;
  let currentPixelRatio = initialPixelRatio;

  return {
    init(gl): void {
      gradient.init(gl);
      pass = createStarfieldPass(gl, starCount, {
        warm: resolveWarm(),
        cool: resolveCool(),
        baseSize,
        twinkleFreq,
        pixelRatio: currentPixelRatio,
      });
    },
    render(frame: SkyboxFrame): void {
      gradient.render(frame);
      pass?.render(frame);
    },
    refresh(): void {
      gradient.refresh?.();
      pass?.setInputs({ warm: resolveWarm(), cool: resolveCool() });
    },
    setPixelRatio(pixelRatio): void {
      currentPixelRatio = pixelRatio;
      gradient.setPixelRatio?.(pixelRatio);
      pass?.setPixelRatio(pixelRatio);
    },
    dispose(): void {
      pass?.dispose();
      pass = null;
      gradient.dispose();
    },
  };
}
