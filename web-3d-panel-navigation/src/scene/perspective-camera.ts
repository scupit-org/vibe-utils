import { Vector3 } from '../math/vector3';
import { Matrix4 } from '../math/matrix4';
import { DEG2RAD } from '../math/math-utils';
import { Object3D } from './object3d';

const _cameraLookMatrix = new Matrix4();

export class PerspectiveCamera extends Object3D {
  /** Runtime tag read by the CSS3D renderer; do not remove. */
  readonly isPerspectiveCamera: true = true;

  fov: number;
  aspect: number;
  near: number;
  far: number;
  projectionMatrix: Matrix4 = new Matrix4();
  matrixWorldInverse: Matrix4 = new Matrix4();

  constructor(fov: number = 50, aspect: number = 1, near: number = 0.1, far: number = 2000) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix(): void {
    this.projectionMatrix.makePerspective(this.fov * DEG2RAD, this.aspect, this.near, this.far);
  }

  /**
   * Camera lookAt: camera looks down its local -Z. Built by feeding
   * Matrix4.lookAt(eye, target, up) so the rotation basis places -Z toward
   * `target`. The resulting rotation is decomposed into this.rotation in
   * its current Euler order so subsequent `updateMatrixWorld` reflects it.
   */
  lookAt(x: number | Vector3, y: number = 0, z: number = 0): void {
    let tx: number, ty: number, tz: number;
    if (typeof x === 'number') {
      tx = x; ty = y; tz = z;
    } else {
      tx = x.x; ty = x.y; tz = x.z;
    }
    const targetVec = new Vector3(tx, ty, tz);
    _cameraLookMatrix.lookAt(this.position, targetVec, this.up);
    this.rotation.setFromRotationMatrix(_cameraLookMatrix, this.rotation.order);
  }
}
