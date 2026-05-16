import {
  Euler,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type EulerOrder,
} from "three";
import type { EulerOrderLike, RenderBackend, RenderTypes } from "../../render-contract";
import { CSS3DRenderer } from "../../render/css3d-renderer";
import { CSS3DObject } from "./css3d-object";
import { SkyboxHost, type SkyboxHostOptions } from "./skybox/skybox-host";
import type { Skybox } from "./skybox/skybox";

/**
 * Concrete `RenderTypes` slots for the three backend. Every primitive is a
 * real three.js class — math types, scene graph nodes, the perspective
 * camera. The shared CSS3DRenderer accepts these because it's typed against
 * structural `render-contract` interfaces, and three's classes satisfy those
 * structurally.
 */
export interface ThreeRenderTypes extends RenderTypes {
  Vector3: Vector3;
  Euler: Euler;
  Quaternion: Quaternion;
  Matrix4: Matrix4;
  Object3D: Object3D;
  Scene: Scene;
  PerspectiveCamera: PerspectiveCamera;
  CSS3DObject: CSS3DObject;
  CSS3DRenderer: CSS3DRenderer;
  Skybox: Skybox;
  SkyboxHost: SkyboxHost;
  SkyboxHostOptions: SkyboxHostOptions;
}

/**
 * The three backend. Pass into `new ZoomPlaneNavigator(refs, threeBackend)`
 * to get a navigator whose camera is a real `THREE.PerspectiveCamera`.
 *
 * Because every primitive the navigator constructs is a real three instance,
 * `threeBackend.createSkyboxHost(...)` can hand the navigator's camera
 * directly to `THREE.WebGLRenderer.render(scene, camera)` — no two-camera
 * sync workaround required.
 */
export const threeBackend: RenderBackend<ThreeRenderTypes> = {
  createVector3(x = 0, y = 0, z = 0): Vector3 {
    return new Vector3(x, y, z);
  },
  createEuler(x = 0, y = 0, z = 0, order: EulerOrderLike = "XYZ"): Euler {
    return new Euler(x, y, z, order as EulerOrder);
  },
  createQuaternion(x = 0, y = 0, z = 0, w = 1): Quaternion {
    return new Quaternion(x, y, z, w);
  },
  createMatrix4(): Matrix4 {
    return new Matrix4();
  },
  createObject3D(): Object3D {
    return new Object3D();
  },
  createScene(): Scene {
    return new Scene();
  },
  createPerspectiveCamera(
    fov = 50,
    aspect = 1,
    near = 0.1,
    far = 2000,
  ): PerspectiveCamera {
    return new PerspectiveCamera(fov, aspect, near, far);
  },
  createCSS3DObject(element: HTMLElement): CSS3DObject {
    return new CSS3DObject(element);
  },
  createCSS3DRenderer(): CSS3DRenderer {
    return new CSS3DRenderer();
  },
  createSkyboxHost(options: SkyboxHostOptions): SkyboxHost {
    return new SkyboxHost(options);
  },
};
