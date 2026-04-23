import type { Skybox } from "./skybox";
import { createGradientMesh, type GradientMeshOptions } from "./gradient-mesh";

export type GradientSkyboxOptions = GradientMeshOptions;

export function createGradientSkybox(options: GradientSkyboxOptions = {}): Skybox {
  const gradient = createGradientMesh(options);

  return {
    root: gradient.mesh,
    update(_dt, camera) {
      gradient.mesh.position.copy(camera.position);
    },
    refresh() {
      gradient.refresh();
    },
    dispose() {
      gradient.dispose();
    },
  };
}
