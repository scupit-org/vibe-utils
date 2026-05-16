/**
 * Three backend public entry.
 *
 * Importing this module pulls in the three.js runtime and all of three's
 * skybox flavors (gradient, starfield, image, panorama). Pass `threeBackend`
 * into `new ZoomPlaneNavigator(refs, threeBackend)` to get a navigator that
 * runs on three primitives end-to-end.
 *
 * Because the navigator's camera in this configuration is a real
 * `THREE.PerspectiveCamera`, `threeBackend.createSkyboxHost(...)` accepts
 * the navigator's camera object directly — no manual two-camera sync.
 */

export { threeBackend } from "./three-backend";
export type { ThreeRenderTypes } from "./three-backend";

export { CSS3DObject } from "./css3d-object";

// Skybox API — preserve the existing public names so consumers only need to
// switch the import subpath.
export { SkyboxHost } from "./skybox/skybox-host";
export type { SkyboxHostOptions } from "./skybox/skybox-host";
export type { Skybox, SkyboxFactory } from "./skybox/skybox";
export { readCssColor } from "./skybox/css-color";
export {
  createGradientMesh,
  GRADIENT_VERTEX_SHADER,
  GRADIENT_FRAGMENT_SHADER,
} from "./skybox/gradient-mesh";
export type { GradientMesh, GradientMeshOptions } from "./skybox/gradient-mesh";
export { createGradientSkybox } from "./skybox/gradient-skybox";
export type { GradientSkyboxOptions } from "./skybox/gradient-skybox";
export {
  createStarfieldSkybox,
  STARFIELD_VERTEX_SHADER,
  STARFIELD_FRAGMENT_SHADER,
} from "./skybox/starfield-skybox";
export type { StarfieldSkyboxOptions } from "./skybox/starfield-skybox";
export { createImageSkybox } from "./skybox/image-skybox";
export type { ImageSkyboxOptions } from "./skybox/image-skybox";
export { createPanoramaSkybox } from "./skybox/panorama-skybox";
export type { PanoramaSkyboxOptions } from "./skybox/panorama-skybox";
