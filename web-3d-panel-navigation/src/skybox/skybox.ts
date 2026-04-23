import type * as THREE from "three";

export interface Skybox {
  root: THREE.Object3D;
  ready?: Promise<void>;
  attach?(scene: THREE.Scene): void;
  detach?(scene: THREE.Scene): void;
  update?(dt: number, camera: THREE.PerspectiveCamera): void;
  refresh?(): void;
  dispose(): void;
}

export type SkyboxFactory = () => Skybox;
