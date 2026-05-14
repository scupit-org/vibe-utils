import { Color } from "three";

export function readCssColor(name: string, fallback: string): Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(raw || fallback);
}
