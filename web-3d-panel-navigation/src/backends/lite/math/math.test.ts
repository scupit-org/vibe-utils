import {
  Vector3 as ThreeVector3,
  Quaternion as ThreeQuaternion,
  Euler as ThreeEuler,
  Matrix4 as ThreeMatrix4,
} from 'three';
import { Vector3, Quaternion, Euler, Matrix4, clamp, DEG2RAD } from './index';

// Tests cross-validate the in-house math primitives against three.js, which is
// already a devDependency. The library itself never imports three for math —
// see src/index.ts and src/backends/lite/skybox/*. The runtime bundle is independent.

const EPS = 1e-5;

function expectClose(actual: number, expected: number, msg = ''): void {
  expect(Math.abs(actual - expected)).toBeLessThan(EPS);
  void msg;
}

function expectArrayClose(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThan(EPS);
  }
}

describe('math-utils', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('DEG2RAD constant', () => {
    expectClose(DEG2RAD, Math.PI / 180);
  });
});

describe('Vector3', () => {
  it('basic ops match three', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, -5, 6);
    const ta = new ThreeVector3(1, 2, 3);
    const tb = new ThreeVector3(4, -5, 6);

    expectClose(a.dot(b), ta.dot(tb));
    expectClose(a.length(), ta.length());
    expectClose(a.distanceTo(b), ta.distanceTo(tb));

    const sum = new Vector3().copy(a).add(b);
    const tSum = new ThreeVector3().copy(ta).add(tb);
    expectClose(sum.x, tSum.x); expectClose(sum.y, tSum.y); expectClose(sum.z, tSum.z);

    const sub = new Vector3().subVectors(a, b);
    const tSub = new ThreeVector3().subVectors(ta, tb);
    expectClose(sub.x, tSub.x); expectClose(sub.y, tSub.y); expectClose(sub.z, tSub.z);

    const scaled = new Vector3().copy(a).multiplyScalar(2.5);
    const tScaled = new ThreeVector3().copy(ta).multiplyScalar(2.5);
    expectClose(scaled.x, tScaled.x);

    const lerped = new Vector3().lerpVectors(a, b, 0.3);
    const tLerped = new ThreeVector3().lerpVectors(ta, tb, 0.3);
    expectClose(lerped.x, tLerped.x); expectClose(lerped.y, tLerped.y); expectClose(lerped.z, tLerped.z);

    const scaledAdd = new Vector3().copy(a).addScaledVector(b, 1.5);
    const tScaledAdd = new ThreeVector3().copy(ta).addScaledVector(tb, 1.5);
    expectClose(scaledAdd.x, tScaledAdd.x);
    expectClose(scaledAdd.y, tScaledAdd.y);
    expectClose(scaledAdd.z, tScaledAdd.z);
  });

  it('normalize matches three for non-trivial vectors', () => {
    for (const [x, y, z] of [[1, 2, 3], [-0.5, 0.7, 0.2], [10, 0, 0]]) {
      const ours = new Vector3(x, y, z).normalize();
      const theirs = new ThreeVector3(x, y, z).normalize();
      expectClose(ours.x, theirs.x);
      expectClose(ours.y, theirs.y);
      expectClose(ours.z, theirs.z);
    }
  });

  it('applyEuler matches three for several XYZ orientations', () => {
    const inputs: [number, number, number][] = [
      [Math.PI / 6, Math.PI / 4, 0],
      [0.3, -0.5, 0.7],
      [Math.PI, 0, 0],
      [0, Math.PI / 2, 0],
    ];
    for (const [ex, ey, ez] of inputs) {
      const v = new Vector3(1, 0, 0).applyEuler(new Euler(ex, ey, ez, 'XYZ'));
      const tv = new ThreeVector3(1, 0, 0).applyEuler(new ThreeEuler(ex, ey, ez, 'XYZ'));
      expectClose(v.x, tv.x);
      expectClose(v.y, tv.y);
      expectClose(v.z, tv.z);
    }
  });

  it('applyQuaternion matches three', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3);
    const tq = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(0, 1, 0), Math.PI / 3);
    const v = new Vector3(2, 3, 4).applyQuaternion(q);
    const tv = new ThreeVector3(2, 3, 4).applyQuaternion(tq);
    expectClose(v.x, tv.x);
    expectClose(v.y, tv.y);
    expectClose(v.z, tv.z);
  });

  it('applyMatrix4 matches three (perspective projection round-trip)', () => {
    const m = new Matrix4().makePerspective(60 * DEG2RAD, 1.5, 0.1, 1000);
    const tm = new ThreeMatrix4().makePerspective(
      -1.5 * 0.1 * Math.tan((60 * DEG2RAD) / 2),
       1.5 * 0.1 * Math.tan((60 * DEG2RAD) / 2),
       0.1 * Math.tan((60 * DEG2RAD) / 2),
      -0.1 * Math.tan((60 * DEG2RAD) / 2),
       0.1, 1000,
    );
    expectArrayClose(m.elements, tm.elements);

    const v = new Vector3(0.4, 0.7, -5).applyMatrix4(m);
    const tv = new ThreeVector3(0.4, 0.7, -5).applyMatrix4(tm);
    expectClose(v.x, tv.x);
    expectClose(v.y, tv.y);
    expectClose(v.z, tv.z);
  });
});

describe('Quaternion', () => {
  it('setFromEuler XYZ matches three', () => {
    const cases: [number, number, number][] = [
      [0.1, 0.2, 0.3],
      [Math.PI / 6, Math.PI / 4, Math.PI / 3],
      [-0.7, 0.5, -0.1],
    ];
    for (const [x, y, z] of cases) {
      const q = new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ'));
      const tq = new ThreeQuaternion().setFromEuler(new ThreeEuler(x, y, z, 'XYZ'));
      expectClose(q.x, tq.x);
      expectClose(q.y, tq.y);
      expectClose(q.z, tq.z);
      expectClose(q.w, tq.w);
    }
  });

  it('setFromAxisAngle matches three', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
    const tq = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(0, 1, 0), Math.PI / 4);
    expectClose(q.x, tq.x);
    expectClose(q.y, tq.y);
    expectClose(q.z, tq.z);
    expectClose(q.w, tq.w);
  });

  it('multiply matches three (post-multiply order)', () => {
    const a = new Quaternion().setFromEuler(new Euler(0.3, 0.5, 0.7, 'XYZ'));
    const b = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4);
    const c = a.clone().multiply(b);

    const ta = new ThreeQuaternion().setFromEuler(new ThreeEuler(0.3, 0.5, 0.7, 'XYZ'));
    const tb = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(1, 0, 0), 0.4);
    const tc = ta.clone().multiply(tb);

    expectClose(c.x, tc.x);
    expectClose(c.y, tc.y);
    expectClose(c.z, tc.z);
    expectClose(c.w, tc.w);
  });

  it('dot matches three (used for equality checks)', () => {
    const a = new Quaternion().setFromEuler(new Euler(0.3, 0.5, 0.7, 'XYZ'));
    const b = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4);
    const ta = new ThreeQuaternion().setFromEuler(new ThreeEuler(0.3, 0.5, 0.7, 'XYZ'));
    const tb = new ThreeQuaternion().setFromAxisAngle(new ThreeVector3(0, 1, 0), 0.4);
    expectClose(a.dot(b), ta.dot(tb));
  });
});

describe('Euler', () => {
  it('setFromQuaternion XYZ matches three', () => {
    const cases: [number, number, number][] = [
      [0.1, 0.2, 0.3],
      [Math.PI / 5, -Math.PI / 7, Math.PI / 6],
      [0, 0, 0],
    ];
    for (const [x, y, z] of cases) {
      const q = new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ'));
      const e = new Euler().setFromQuaternion(q, 'XYZ');

      const tq = new ThreeQuaternion().setFromEuler(new ThreeEuler(x, y, z, 'XYZ'));
      const te = new ThreeEuler().setFromQuaternion(tq, 'XYZ');

      expectClose(e.x, te.x);
      expectClose(e.y, te.y);
      expectClose(e.z, te.z);
    }
  });
});

describe('Matrix4', () => {
  it('compose matches three', () => {
    const position = new Vector3(10, 20, 30);
    const rotation = new Euler(0.3, 0.5, 0.7, 'XYZ');
    const quat = new Quaternion().setFromEuler(rotation);
    const scale = new Vector3(1.5, 2, 0.5);
    const m = new Matrix4().compose(position, quat, scale);

    const tPos = new ThreeVector3(10, 20, 30);
    const tRot = new ThreeEuler(0.3, 0.5, 0.7, 'XYZ');
    const tQuat = new ThreeQuaternion().setFromEuler(tRot);
    const tScale = new ThreeVector3(1.5, 2, 0.5);
    const tm = new ThreeMatrix4().compose(tPos, tQuat, tScale);

    expectArrayClose(m.elements, tm.elements);
  });

  it('invert matches three for an arbitrary affine matrix', () => {
    const m = new Matrix4().compose(
      new Vector3(5, -3, 7),
      new Quaternion().setFromEuler(new Euler(0.2, 0.4, 0.6, 'XYZ')),
      new Vector3(1, 1, 1),
    );
    const tm = new ThreeMatrix4().compose(
      new ThreeVector3(5, -3, 7),
      new ThreeQuaternion().setFromEuler(new ThreeEuler(0.2, 0.4, 0.6, 'XYZ')),
      new ThreeVector3(1, 1, 1),
    );
    m.invert();
    tm.invert();
    expectArrayClose(m.elements, tm.elements);
  });

  it('lookAt rotation basis matches three', () => {
    const eye = new Vector3(0, 0, 0);
    const target = new Vector3(2, 1, -5);
    const up = new Vector3(0, 1, 0);
    const m = new Matrix4().lookAt(eye, target, up);

    const tm = new ThreeMatrix4().lookAt(
      new ThreeVector3(0, 0, 0),
      new ThreeVector3(2, 1, -5),
      new ThreeVector3(0, 1, 0),
    );
    expectArrayClose(m.elements, tm.elements);
  });

  it('makePerspective produces elements[5] = 1/tan(fov/2) (CSS3D renderer dependency)', () => {
    const m = new Matrix4().makePerspective(50 * DEG2RAD, 16 / 9, 0.1, 10000);
    expectClose(m.elements[5], 1 / Math.tan((50 * DEG2RAD) / 2));
  });
});
