import type { Vector3 } from './vector3';
import type { Quaternion } from './quaternion';

/**
 * 4x4 matrix stored as a 16-element Float32Array in column-major order,
 * matching three.js so callers that read `.elements[i]` directly (like the
 * CSS3D renderer) get the same numbers.
 */
export class Matrix4 {
  elements: Float32Array;

  constructor() {
    this.elements = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  identity(): this {
    const te = this.elements;
    te[0] = 1; te[4] = 0; te[8] = 0; te[12] = 0;
    te[1] = 0; te[5] = 1; te[9] = 0; te[13] = 0;
    te[2] = 0; te[6] = 0; te[10] = 1; te[14] = 0;
    te[3] = 0; te[7] = 0; te[11] = 0; te[15] = 1;
    return this;
  }

  copy(m: Matrix4): this {
    this.elements.set(m.elements);
    return this;
  }

  clone(): Matrix4 {
    return new Matrix4().copy(this);
  }

  multiply(m: Matrix4): this {
    return this.multiplyMatrices(this, m);
  }

  multiplyMatrices(a: Matrix4, b: Matrix4): this {
    const ae = a.elements, be = b.elements, te = this.elements;
    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

    te[0]  = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4]  = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8]  = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1]  = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5]  = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9]  = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2]  = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6]  = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3]  = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7]  = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }

  /** Full 4x4 invert; matches three's algorithm exactly. */
  invert(): this {
    const te = this.elements;
    const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3];
    const n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
    const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11];
    const n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];

    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (det === 0) {
      te[0] = 0; te[1] = 0; te[2] = 0; te[3] = 0;
      te[4] = 0; te[5] = 0; te[6] = 0; te[7] = 0;
      te[8] = 0; te[9] = 0; te[10] = 0; te[11] = 0;
      te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 0;
      return this;
    }
    const detInv = 1 / det;

    te[0] = t11 * detInv;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;

    te[4] = t12 * detInv;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;

    te[8] = t13 * detInv;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;

    te[12] = t14 * detInv;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
    return this;
  }

  /**
   * Build T·R(quaternion)·S directly. Matches three.js Matrix4.compose
   * element-by-element so downstream readers (CSS3D matrix3d strings) see
   * identical numbers.
   */
  compose(position: Vector3, quaternion: Quaternion, scale: Vector3): this {
    const te = this.elements;
    const x = quaternion.x, y = quaternion.y, z = quaternion.z, w = quaternion.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = scale.x, sy = scale.y, sz = scale.z;

    te[0] = (1 - (yy + zz)) * sx;
    te[1] = (xy + wz) * sx;
    te[2] = (xz - wy) * sx;
    te[3] = 0;

    te[4] = (xy - wz) * sy;
    te[5] = (1 - (xx + zz)) * sy;
    te[6] = (yz + wx) * sy;
    te[7] = 0;

    te[8] = (xz + wy) * sz;
    te[9] = (yz - wx) * sz;
    te[10] = (1 - (xx + yy)) * sz;
    te[11] = 0;

    te[12] = position.x;
    te[13] = position.y;
    te[14] = position.z;
    te[15] = 1;
    return this;
  }

  /** Replace the rotation part with the rotation encoded in a quaternion. */
  makeRotationFromQuaternion(q: Quaternion): this {
    const te = this.elements;
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    te[0] = 1 - (yy + zz);
    te[1] = xy + wz;
    te[2] = xz - wy;
    te[3] = 0;

    te[4] = xy - wz;
    te[5] = 1 - (xx + zz);
    te[6] = yz + wx;
    te[7] = 0;

    te[8] = xz + wy;
    te[9] = yz - wx;
    te[10] = 1 - (xx + yy);
    te[11] = 0;

    te[12] = 0;
    te[13] = 0;
    te[14] = 0;
    te[15] = 1;
    return this;
  }

  /**
   * Fill the rotation 3x3 with a basis built so the matrix's local -Z points
   * from `eye` toward `target` (camera convention; matches three.js
   * Matrix4.lookAt). Translation row/column are NOT touched.
   */
  lookAt(eye: Vector3, target: Vector3, up: Vector3): this {
    const te = this.elements;
    // z basis (back direction): eye - target
    let zx = eye.x - target.x;
    let zy = eye.y - target.y;
    let zz = eye.z - target.z;
    let zLenSq = zx * zx + zy * zy + zz * zz;
    if (zLenSq === 0) {
      zz = 1;
      zLenSq = 1;
    }
    const zInv = 1 / Math.sqrt(zLenSq);
    zx *= zInv; zy *= zInv; zz *= zInv;

    // x basis: up × z
    let xx = up.y * zz - up.z * zy;
    let xy = up.z * zx - up.x * zz;
    let xz_ = up.x * zy - up.y * zx;
    let xLenSq = xx * xx + xy * xy + xz_ * xz_;
    if (xLenSq === 0) {
      // up is collinear with z; nudge z and retry
      if (Math.abs(up.z) === 1) {
        zx += 0.0001;
      } else {
        zz += 0.0001;
      }
      const zLenSq2 = zx * zx + zy * zy + zz * zz;
      const zInv2 = 1 / Math.sqrt(zLenSq2);
      zx *= zInv2; zy *= zInv2; zz *= zInv2;
      xx = up.y * zz - up.z * zy;
      xy = up.z * zx - up.x * zz;
      xz_ = up.x * zy - up.y * zx;
      xLenSq = xx * xx + xy * xy + xz_ * xz_;
    }
    const xInv = 1 / Math.sqrt(xLenSq);
    xx *= xInv; xy *= xInv; xz_ *= xInv;

    // y basis: z × x
    const yx = zy * xz_ - zz * xy;
    const yy_ = zz * xx - zx * xz_;
    const yz = zx * xy - zy * xx;

    te[0] = xx;  te[4] = yx;  te[8] = zx;
    te[1] = xy;  te[5] = yy_; te[9] = zy;
    te[2] = xz_; te[6] = yz;  te[10] = zz;
    return this;
  }

  /**
   * WebGL-convention perspective projection matrix.
   *
   * @param fov  vertical field of view in RADIANS
   * @param aspect  width / height
   */
  makePerspective(fov: number, aspect: number, near: number, far: number): this {
    const te = this.elements;
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);

    te[0] = f / aspect; te[4] = 0; te[8] = 0;                   te[12] = 0;
    te[1] = 0;          te[5] = f; te[9] = 0;                   te[13] = 0;
    te[2] = 0;          te[6] = 0; te[10] = (far + near) * nf;  te[14] = 2 * far * near * nf;
    te[3] = 0;          te[7] = 0; te[11] = -1;                 te[15] = 0;
    return this;
  }
}
