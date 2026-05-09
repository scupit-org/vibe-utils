export { ZoomPlaneNavigator } from './zoom-navigation';
export { SceneGraph } from './scene-graph';
export { DEFAULT_CONFIG } from './types';

export type {
  CameraState,
  ContainerRefs,
  NavigationConfig,
  NavigationEventType,
  NavigationState,
  PlaneScaleMode,
  RevealMode,
  ScreenRect,
  ZoomPlaneConfig,
} from './types';

// Skybox subsystem (optional WebGL layer)
export { SkyboxHost } from './skybox/skybox-host';
export type { SkyboxHostOptions } from './skybox/skybox-host';
export type { Skybox, SkyboxFactory } from './skybox/skybox';
export { readCssColor } from './skybox/css-color';
export {
  createGradientMesh,
  GRADIENT_VERTEX_SHADER,
  GRADIENT_FRAGMENT_SHADER,
} from './skybox/gradient-mesh';
export type { GradientMesh, GradientMeshOptions } from './skybox/gradient-mesh';
export { createGradientSkybox } from './skybox/gradient-skybox';
export type { GradientSkyboxOptions } from './skybox/gradient-skybox';
export {
  createStarfieldSkybox,
  STARFIELD_VERTEX_SHADER,
  STARFIELD_FRAGMENT_SHADER,
} from './skybox/starfield-skybox';
export type { StarfieldSkyboxOptions } from './skybox/starfield-skybox';
export { createImageSkybox } from './skybox/image-skybox';
export type { ImageSkyboxOptions } from './skybox/image-skybox';
export { createPanoramaSkybox } from './skybox/panorama-skybox';
export type { PanoramaSkyboxOptions } from './skybox/panorama-skybox';
