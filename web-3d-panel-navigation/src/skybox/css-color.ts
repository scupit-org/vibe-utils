import * as THREE from "three";

export function readCssColor(name: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(raw || fallback);
}
