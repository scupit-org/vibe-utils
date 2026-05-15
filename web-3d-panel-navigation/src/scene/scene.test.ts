import {
  Scene as ThreeScene,
  PerspectiveCamera as ThreePerspectiveCamera,
  Object3D as ThreeObject3D,
} from 'three';
import { Object3D, Scene, PerspectiveCamera } from './index';

// Cross-validate the scene-graph types against three. Tests can import three
// freely — only the library's runtime path must stay three-free.

const EPS = 1e-5;

function expectArrayClose(a: ArrayLike<number>, b: ArrayLike<number>): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(Math.abs(a[i] - b[i])).toBeLessThan(EPS);
  }
}

describe('Object3D', () => {
  it('add/remove updates parent and children linkage', () => {
    const parent = new Object3D();
    const child = new Object3D();
    parent.add(child);
    expect(parent.children).toContain(child);
    expect(child.parent).toBe(parent);

    parent.remove(child);
    expect(parent.children).not.toContain(child);
    expect(child.parent).toBeNull();
  });

  it("dispatches 'removed' on the child when remove() is called", () => {
    const parent = new Object3D();
    const child = new Object3D();
    parent.add(child);

    const events: string[] = [];
    child.addEventListener('removed', (e) => events.push(e.type));

    parent.remove(child);
    expect(events).toEqual(['removed']);
  });

  it('updateMatrixWorld matches three for a single root object', () => {
    const ours = new Object3D();
    ours.position.set(10, -5, 3);
    ours.rotation.set(0.3, 0.5, 0.7);
    ours.scale.set(2, 1.5, 0.5);
    ours.updateMatrixWorld();

    const theirs = new ThreeObject3D();
    theirs.position.set(10, -5, 3);
    theirs.rotation.set(0.3, 0.5, 0.7);
    theirs.scale.set(2, 1.5, 0.5);
    theirs.updateMatrixWorld(true);

    expectArrayClose(ours.matrixWorld.elements, theirs.matrixWorld.elements);
  });

  it('updateMatrixWorld propagates through a parent/child chain', () => {
    const oursParent = new Object3D();
    oursParent.position.set(1, 2, 3);
    oursParent.rotation.set(0, Math.PI / 4, 0);
    const oursChild = new Object3D();
    oursChild.position.set(5, 0, 0);
    oursParent.add(oursChild);
    oursParent.updateMatrixWorld();

    const tp = new ThreeObject3D();
    tp.position.set(1, 2, 3);
    tp.rotation.set(0, Math.PI / 4, 0);
    const tc = new ThreeObject3D();
    tc.position.set(5, 0, 0);
    tp.add(tc);
    tp.updateMatrixWorld(true);

    expectArrayClose(oursChild.matrixWorld.elements, tc.matrixWorld.elements);
  });

  it('traverse visits every node in the subtree', () => {
    const a = new Object3D();
    const b = new Object3D();
    const c = new Object3D();
    a.add(b); b.add(c);
    const visited: Object3D[] = [];
    a.traverse((o) => visited.push(o));
    expect(visited).toEqual([a, b, c]);
  });
});

describe('Scene', () => {
  it('is an Object3D with matrixWorldAutoUpdate (CSS3D renderer dependency)', () => {
    const s = new Scene();
    expect(s).toBeInstanceOf(Object3D);
    expect(s.matrixWorldAutoUpdate).toBe(true);
  });
});

describe('PerspectiveCamera', () => {
  it('exposes isPerspectiveCamera = true (CSS3D renderer reads it as a tag)', () => {
    const cam = new PerspectiveCamera();
    expect(cam.isPerspectiveCamera).toBe(true);
  });

  it('updateProjectionMatrix matches three numerically (CSS3D reads elements[5])', () => {
    const cam = new PerspectiveCamera(50, 16 / 9, 0.1, 10000);
    const tc = new ThreePerspectiveCamera(50, 16 / 9, 0.1, 10000);
    expectArrayClose(cam.projectionMatrix.elements, tc.projectionMatrix.elements);
    // The CSS3D renderer specifically reads element[5] every frame.
    expect(cam.projectionMatrix.elements[5]).toBeCloseTo(tc.projectionMatrix.elements[5]);
  });

  it('aspect change followed by updateProjectionMatrix matches three', () => {
    const cam = new PerspectiveCamera(50, 1, 0.1, 1000);
    cam.aspect = 2.5;
    cam.updateProjectionMatrix();
    const tc = new ThreePerspectiveCamera(50, 1, 0.1, 1000);
    tc.aspect = 2.5;
    tc.updateProjectionMatrix();
    expectArrayClose(cam.projectionMatrix.elements, tc.projectionMatrix.elements);
  });

  it('lookAt followed by updateMatrixWorld gives a world matrix that points -Z toward target', () => {
    const cam = new PerspectiveCamera(50, 1, 0.1, 1000);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();

    // Three's camera looks down -Z; matrixWorld column 2 (back basis) negated should point from camera to target.
    const e = cam.matrixWorld.elements;
    const forwardX = -e[8], forwardY = -e[9], forwardZ = -e[10];
    // From (0,0,10) looking at (0,0,0) → forward is (0, 0, -1).
    expect(forwardX).toBeCloseTo(0);
    expect(forwardY).toBeCloseTo(0);
    expect(forwardZ).toBeCloseTo(-1);
  });

  it('matrixWorldInverse computed via copy().invert() round-trips matrixWorld', () => {
    const cam = new PerspectiveCamera();
    cam.position.set(3, 2, 5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();

    // matrixWorld * matrixWorldInverse should be ~identity.
    const a = cam.matrixWorld.elements;
    const b = cam.matrixWorldInverse.elements;
    const product = new Array(16).fill(0);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          s += a[r + k * 4] * b[k + c * 4];
        }
        product[r + c * 4] = s;
      }
    }
    const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    for (let i = 0; i < 16; i++) {
      expect(Math.abs(product[i] - identity[i])).toBeLessThan(1e-4);
    }
  });
});
