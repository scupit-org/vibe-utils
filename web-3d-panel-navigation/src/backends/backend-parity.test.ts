/**
 * @jest-environment jsdom
 *
 * The parity tests for `createCSS3DObject` need a real `document` so the
 * backend factory can wrap (or construct) an HTMLElement. The repo-wide
 * default is the `node` environment because `url-hash-sync.test.ts`
 * reassigns `globalThis.window` (which jsdom refuses to allow). Per-file
 * opt-in keeps this test isolated to jsdom without affecting the rest.
 */
import { liteBackend } from './lite';
import { threeBackend } from './three';
import type { RenderBackend, RenderTypes } from '../render-contract';

// Both backends must implement the same `RenderBackend` contract. These tests
// confirm the contract is satisfied at runtime, not just structurally.

// Type-only assertion: both backends are assignable to RenderBackend<RenderTypes>.
// This catches contract drift at compile time even if the runtime checks below
// happen to pass.
const _lite: RenderBackend<RenderTypes> = liteBackend;
const _three: RenderBackend<RenderTypes> = threeBackend;
void _lite;
void _three;

describe('RenderBackend contract parity', () => {
  const backends: Array<{ name: string; backend: RenderBackend<RenderTypes> }> = [
    { name: 'liteBackend', backend: liteBackend },
    { name: 'threeBackend', backend: threeBackend },
  ];

  for (const { name, backend } of backends) {
    describe(name, () => {
      it('createPerspectiveCamera returns a camera satisfying the contract surface', () => {
        const cam = backend.createPerspectiveCamera(50, 16 / 9, 0.1, 1000);
        // `PerspectiveCameraLike.isPerspectiveCamera` is typed as `boolean`
        // (so three's `PerspectiveCamera` is assignable to the interface),
        // but the contract requires every backend-constructed camera to have
        // it strictly equal to `true`. This assertion is the runtime
        // enforcement of that invariant.
        expect(cam.isPerspectiveCamera).toBe(true);
        expect(cam.fov).toBe(50);
        expect(cam.aspect).toBeCloseTo(16 / 9);
        expect(cam.near).toBe(0.1);
        expect(cam.far).toBe(1000);
        expect(typeof cam.updateProjectionMatrix).toBe('function');
        expect(typeof cam.updateMatrixWorld).toBe('function');
        expect(typeof cam.lookAt).toBe('function');
        // Both backends store column-major 4x4 elements indexable as
        // `elements[i]`; three uses a plain Array while lite uses Float32Array.
        // The CSS3D renderer only reads by index, so either is acceptable.
        expect(cam.projectionMatrix.elements.length).toBe(16);
        expect(cam.matrixWorldInverse.elements.length).toBe(16);
      });

      it('createVector3 produces an object with x/y/z and a working clone()', () => {
        const v = backend.createVector3(1, 2, 3);
        expect(v.x).toBe(1);
        expect(v.y).toBe(2);
        expect(v.z).toBe(3);
        const c = v.clone();
        expect(c.x).toBe(1);
        expect(c.y).toBe(2);
        expect(c.z).toBe(3);
        expect(c).not.toBe(v);
      });

      it('createScene returns a node that can hold Object3D children', () => {
        const scene = backend.createScene();
        const child = backend.createObject3D();
        scene.add(child);
        expect(scene.children).toContain(child);
      });

      it('createCSS3DObject returns a CSS3D-tagged Object3D wrapping a DOM element', () => {
        const element = document.createElement('div');
        const css = backend.createCSS3DObject(element);
        // Runtime tag the shared CSS3DRenderer reads to identify CSS3D-aware
        // nodes during traversal. Must be strictly true on every backend.
        expect(css.isCSS3DObject).toBe(true);
        expect(css.element).toBe(element);
        // The returned object should be addable to a Scene as a child.
        const scene = backend.createScene();
        scene.add(css);
        expect(scene.children).toContain(css);
      });

      it('createMatrix4 / createEuler / createQuaternion produce typed values', () => {
        const m = backend.createMatrix4();
        expect(m.elements.length).toBe(16);

        const e = backend.createEuler(0.1, 0.2, 0.3, 'XYZ');
        expect(e.x).toBeCloseTo(0.1);
        expect(e.y).toBeCloseTo(0.2);
        expect(e.z).toBeCloseTo(0.3);
        expect(e.order).toBe('XYZ');

        const q = backend.createQuaternion(0, 0, 0, 1);
        expect(q.x).toBe(0);
        expect(q.w).toBe(1);
      });
    });
  }
});
