/**
 * Lite backend public entry.
 *
 * Importing this module pulls in only the library's three-free primitives and
 * the lite WebGL2 skybox renderer. Pass `liteBackend` into
 * `new ZoomPlaneNavigator(refs, liteBackend)` for the small-bundle path.
 */

export { liteBackend } from './lite-backend';
export type { LiteRenderTypes } from './lite-backend';

// Concrete types — consumers can annotate their own helpers against these.
export { Vector3, Euler, Quaternion, Matrix4 } from './math';
export type { EulerOrder, ProjectableCamera } from './math';
export { Object3D, Scene, PerspectiveCamera, CSS3DObject } from './scene';
export type { SceneEvent, SceneEventListener } from './scene';

// Skybox factories and types
export { LiteSkyboxHost } from './skybox/lite-skybox-host';
export type { LiteSkybox, LiteSkyboxHostOptions, SkyboxFrame } from './skybox/lite-skybox';
export { createGradientSkybox } from './skybox/factories/gradient-skybox';
export type { GradientSkyboxOptions } from './skybox/factories/gradient-skybox';
export { createStarfieldSkybox } from './skybox/factories/starfield-skybox';
export type { StarfieldSkyboxOptions } from './skybox/factories/starfield-skybox';
export { readCssColor, parseColorToLinear } from './skybox/css-color';
export type { LinearRgb } from './skybox/css-color';
