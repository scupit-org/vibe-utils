import { Vector3 } from '../math/vector3';
import { Euler } from '../math/euler';
import { Quaternion } from '../math/quaternion';
import { Matrix4 } from '../math/matrix4';
import { EventDispatcher } from './event-dispatcher';

const _tempQuat = new Quaternion();
const _lookMatrix = new Matrix4();

export class Object3D extends EventDispatcher {
  position: Vector3 = new Vector3(0, 0, 0);
  rotation: Euler = new Euler(0, 0, 0, 'XYZ');
  scale: Vector3 = new Vector3(1, 1, 1);
  up: Vector3 = new Vector3(0, 1, 0);
  matrix: Matrix4 = new Matrix4();
  matrixWorld: Matrix4 = new Matrix4();
  matrixWorldAutoUpdate: boolean = true;
  parent: Object3D | null = null;
  children: Object3D[] = [];

  add(child: Object3D): this {
    if (child.parent !== null) {
      child.parent.remove(child);
    }
    child.parent = this;
    this.children.push(child);
    return this;
  }

  remove(child: Object3D): this {
    const i = this.children.indexOf(child);
    if (i !== -1) {
      child.parent = null;
      this.children.splice(i, 1);
      child.dispatchEvent({ type: 'removed' });
    }
    return this;
  }

  traverse(callback: (object: Object3D) => void): void {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  /** Compose local matrix from position, rotation (Euler), scale. */
  updateMatrix(): void {
    _tempQuat.setFromEuler(this.rotation);
    this.matrix.compose(this.position, _tempQuat, this.scale);
  }

  /**
   * Recompute matrixWorld for this object and (recursively) all descendants.
   * Mirrors three's Object3D.updateMatrixWorld semantics — local matrix is
   * recomposed first, then multiplied by the parent's world matrix.
   */
  updateMatrixWorld(): void {
    this.updateMatrix();
    if (this.parent === null) {
      this.matrixWorld.copy(this.matrix);
    } else {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    for (const child of this.children) {
      child.updateMatrixWorld();
    }
  }

  /**
   * Object lookAt (looks down +Z). Cameras override to look down -Z.
   * Ignores parent transforms — sufficient for the navigator's use, where
   * cameras live at scene root.
   */
  lookAt(x: number | Vector3, y: number = 0, z: number = 0): void {
    let tx: number, ty: number, tz: number;
    if (typeof x === 'number') {
      tx = x; ty = y; tz = z;
    } else {
      tx = x.x; ty = x.y; tz = x.z;
    }
    const targetVec = new Vector3(tx, ty, tz);
    // Object convention: matrix.lookAt(target, eye, up).
    _lookMatrix.lookAt(targetVec, this.position, this.up);
    this.rotation.setFromRotationMatrix(_lookMatrix, this.rotation.order);
  }

  copy(source: Object3D, recursive: boolean = true): this {
    this.position.copy(source.position);
    this.rotation.copy(source.rotation);
    this.scale.copy(source.scale);
    this.up.copy(source.up);
    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);
    this.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    if (recursive) {
      for (const child of source.children) {
        // Plain Object3D clone — subclasses that override `copy` (e.g.
        // CSS3DObject) handle their own subtree if they choose to.
        const cloned = new Object3D();
        cloned.copy(child, true);
        this.add(cloned);
      }
    }
    return this;
  }
}
