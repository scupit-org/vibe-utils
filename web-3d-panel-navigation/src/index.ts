export { ZoomPlaneNavigator } from './zoom-navigation';
export { SceneGraph } from './scene-graph';
export { DEFAULT_CONFIG } from './types';
export { resolveContainerRefs, REQUIRED_CONTAINER_IDS } from './container-refs';
export { shouldEnhance, markEnhanced, ENHANCED_CLASS, LITE_VERSION_CLASS, IS_PANEL_IN_MOTION_CSS_CLASS } from './enhancement';

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

// Backend contract types — consumers writing their own helpers can reference
// these. Concrete backends are imported from the dedicated subpaths
// (`@scupit/web-3d-panel-navigation/lite-backend` or
// `@scupit/web-3d-panel-navigation/three-backend`).
export type {
  RenderBackend,
  RenderTypes,
  Vec3Like,
  EulerLike,
  EulerOrderLike,
  QuaternionLike,
  Matrix4Like,
  Object3DLike,
  SceneLike,
  PerspectiveCameraLike,
  CSS3DObjectLike,
  CSS3DRendererLike,
  SkyboxHostLike,
} from './render-contract';
