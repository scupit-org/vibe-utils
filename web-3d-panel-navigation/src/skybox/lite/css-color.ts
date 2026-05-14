export type LinearRgb = [number, number, number];

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FUNC = /^rgba?\(\s*([^)]+)\)$/i;

function srgbToLinear(c: number): number {
  // Cheap pow(2.2) approximation; matches three.js Color's default behavior
  // closely enough for skybox-decorative use, where the alternative is a more
  // expensive piecewise sRGB transform.
  return Math.pow(c, 2.2);
}

function parseChannel(token: string): number {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    const v = parseFloat(trimmed.slice(0, -1));
    return Math.min(1, Math.max(0, v / 100));
  }
  const v = parseFloat(trimmed);
  return Math.min(1, Math.max(0, v / 255));
}

function parseSrgb(value: string): LinearRgb | null {
  const raw = value.trim();
  if (!raw) return null;
  const m6 = HEX6.exec(raw);
  if (m6) {
    return [
      parseInt(m6[1], 16) / 255,
      parseInt(m6[2], 16) / 255,
      parseInt(m6[3], 16) / 255,
    ];
  }
  const m3 = HEX3.exec(raw);
  if (m3) {
    return [
      parseInt(m3[1] + m3[1], 16) / 255,
      parseInt(m3[2] + m3[2], 16) / 255,
      parseInt(m3[3] + m3[3], 16) / 255,
    ];
  }
  const fn = RGB_FUNC.exec(raw);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      return [parseChannel(parts[0]), parseChannel(parts[1]), parseChannel(parts[2])];
    }
  }
  return null;
}

/**
 * Reads a CSS custom property from :root, falls back to `fallback` if unset or
 * unparseable, and returns the color as linear-space RGB in [0,1]. Mirrors the
 * behavior of `src/skybox/css-color.ts` but without depending on three.Color —
 * three internally linearizes hex/string inputs on Color construction; we do
 * the same here so shader-side mixing happens in linear space and the
 * fragment shader can re-encode to sRGB on output.
 */
export function readCssColor(name: string, fallback: string): LinearRgb {
  let raw = "";
  if (typeof window !== "undefined" && typeof getComputedStyle === "function") {
    raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  const srgb = parseSrgb(raw) ?? parseSrgb(fallback) ?? [0, 0, 0];
  return [srgbToLinear(srgb[0]), srgbToLinear(srgb[1]), srgbToLinear(srgb[2])];
}

/** Linearize a CSS color string directly, used for explicit `colors` overrides. */
export function parseColorToLinear(value: string): LinearRgb {
  const srgb = parseSrgb(value) ?? [0, 0, 0];
  return [srgbToLinear(srgb[0]), srgbToLinear(srgb[1]), srgbToLinear(srgb[2])];
}
