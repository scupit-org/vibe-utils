import type { EulerOrderLike, RenderBackend, RenderTypes } from '../../render-contract';
import { CSS3DRenderer } from '../../render/css3d-renderer';
import { Euler, Matrix4, Quaternion, Vector3 } from './math';
import type { EulerOrder } from './math/euler';
import { CSS3DObject, Object3D, PerspectiveCamera, Scene } from './scene';
import { LiteSkyboxHost } from './skybox/lite-skybox-host';
import type { LiteSkybox, LiteSkyboxHostOptions } from './skybox/lite-skybox';

/**
 * Concrete `RenderTypes` slots for the lite backend. Each slot is the
 * library-native class that the lite path uses at runtime.
 */
export interface LiteRenderTypes extends RenderTypes {
  Vector3: Vector3;
  Euler: Euler;
  Quaternion: Quaternion;
  Matrix4: Matrix4;
  Object3D: Object3D;
  Scene: Scene;
  PerspectiveCamera: PerspectiveCamera;
  CSS3DObject: CSS3DObject;
  CSS3DRenderer: CSS3DRenderer;
  Skybox: LiteSkybox;
  SkyboxHost: LiteSkyboxHost;
  SkyboxHostOptions: LiteSkyboxHostOptions;
}

/**
 * The lite backend. Pass this into `new ZoomPlaneNavigator(refs, liteBackend)`
 * to get a navigator whose camera/scene/object3d are the library's three-free
 * classes, and whose skybox host runs on raw WebGL2.
 */
export const liteBackend: RenderBackend<LiteRenderTypes> = {
  createVector3(x = 0, y = 0, z = 0): Vector3 {
    return new Vector3(x, y, z);
  },
  createEuler(x = 0, y = 0, z = 0, order: EulerOrderLike = 'XYZ'): Euler {
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
  createSkyboxHost(options: LiteSkyboxHostOptions): LiteSkyboxHost {
    return new LiteSkyboxHost(options);
  },
};
