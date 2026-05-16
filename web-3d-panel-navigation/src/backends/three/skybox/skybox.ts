import type { Object3D, Scene, PerspectiveCamera } from "three";

export interface Skybox {
  root: Object3D;
  ready?: Promise<void>;
  attach?(scene: Scene): void;
  detach?(scene: Scene): void;
  update?(dt: number, camera: PerspectiveCamera): void;
  setPixelRatio?(pixelRatio: number): void;
  refresh?(): void;
  dispose(): void;
}

export type SkyboxFactory = () => Skybox;
