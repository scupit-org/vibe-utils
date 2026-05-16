/**
 * @jest-environment jsdom
 */

import { parseAllZoomPlanes, parseZoomPlane } from './zoom-plane-parser';
import type { ZoomPlaneConfig } from './types';
import { Vector3, Quaternion, Euler } from './backends/lite/math';
import { liteBackend } from './backends/lite';

function createZoomPlaneElement(
  attributes: Record<string, string>
): HTMLElement {
  const el = document.createElement('div');
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  return el;
}

function createContainer(elements: HTMLElement[]): HTMLElement {
  const container = document.createElement('div');
  for (const el of elements) container.appendChild(el);
  return container;
}

function getPlane(configs: ZoomPlaneConfig[], id: string): ZoomPlaneConfig {
  const config = configs.find(item => item.id === id);
  if (!config) {
    throw new Error(`Missing plane ${id}`);
  }
  return config;
}

function expectVectorClose(actual: Vector3, expected: Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

function quaternionFromConfig(config: ZoomPlaneConfig): Quaternion {
  return new Quaternion().setFromEuler(
    new Euler(config.rotation[0], config.rotation[1], config.rotation[2], 'XYZ')
  );
}

function expectQuaternionClose(actual: Quaternion, expected: Quaternion): void {
  expect(Math.abs(actual.dot(expected))).toBeCloseTo(1);
}

function referenceLocalOffset(
  reference: ZoomPlaneConfig,
  x: number,
  y: number
): Vector3 {
  const quaternion = quaternionFromConfig(reference);
  const right = new Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(quaternion);
  return right.multiplyScalar(x).add(up.multiplyScalar(y));
}

function localAxis(reference: ZoomPlaneConfig, axis: 'right' | 'up'): Vector3 {
  const quaternion = quaternionFromConfig(reference);
  return new Vector3(axis === 'right' ? 1 : 0, axis === 'up' ? 1 : 0, 0)
    .applyQuaternion(quaternion)
    .normalize();
}

function expectSameProjectionOnAxis(
  actual: Vector3,
  expected: Vector3,
  axis: Vector3
): void {
  expect(actual.dot(axis)).toBeCloseTo(expected.dot(axis));
}

function edgeCenter(
  config: ZoomPlaneConfig,
  side: 'left' | 'right' | 'top' | 'bottom',
  scale: number
): Vector3 {
  const center = new Vector3(
    config.position[0],
    config.position[1],
    config.position[2]
  );
  const euler = new Euler(config.rotation[0], config.rotation[1], config.rotation[2]);
  const right = new Vector3(1, 0, 0).applyEuler(euler);
  const up = new Vector3(0, 1, 0).applyEuler(euler);

  if (side === 'right') {
    return center.add(right.multiplyScalar(config.width * scale / 2));
  }
  if (side === 'left') {
    return center.add(right.multiplyScalar(-config.width * scale / 2));
  }
  if (side === 'top') {
    return center.add(up.multiplyScalar(config.height * scale / 2));
  }
  return center.add(up.multiplyScalar(-config.height * scale / 2));
}

describe('zoom plane parser', () => {
  it('accepts strict finite decimal values, including signs and scientific notation', () => {
    const config = parseZoomPlane(createZoomPlaneElement({
      'data-zoom-plane': 'valid',
      'data-section': 'page-valid',
      'data-width': '1.2e3',
      'data-height': '.5',
      'data-position': '-1, +2.5, 3e2',
      'data-rotation': '0, -45, 1e1',
    }));

    expect(config.id).toBe('valid');
    expect(config.width).toBe(1200);
    expect(config.height).toBe(0.5);
    expect(config.position).toEqual([-1, 2.5, 300]);
    expect(config.rotation[0]).toBeCloseTo(0);
    expect(config.rotation[1]).toBeCloseTo(-Math.PI / 4);
    expect(config.rotation[2]).toBeCloseTo(Math.PI / 18);
  });

  it.each([
    ['suffixed width', { 'data-width': '100px', 'data-height': '1', 'data-position': '0, 0, 0', 'data-rotation': '0, 0, 0' }],
    ['suffixed position', { 'data-width': '1', 'data-height': '1', 'data-position': '0, 10abc, 0', 'data-rotation': '0, 0, 0' }],
    ['infinite rotation', { 'data-width': '1', 'data-height': '1', 'data-position': '0, 0, 0', 'data-rotation': '0, Infinity, 0' }],
    ['hex width', { 'data-width': '0x10', 'data-height': '1', 'data-position': '0, 0, 0', 'data-rotation': '0, 0, 0' }],
    ['non-positive height', { 'data-width': '1', 'data-height': '0', 'data-position': '0, 0, 0', 'data-rotation': '0, 0, 0' }],
  ])('rejects malformed numeric attributes: %s', (_caseName, values) => {
    expect(() => parseZoomPlane(createZoomPlaneElement({
      'data-zoom-plane': 'invalid',
      'data-section': 'page-invalid',
      ...values,
    }))).toThrow();
  });

  it('rejects duplicate plane IDs and multiple focal planes', () => {
    const first = createZoomPlaneElement({
      'data-zoom-plane': 'duplicate',
      'data-section': 'page-one',
      'data-width': '1',
      'data-height': '1',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const second = createZoomPlaneElement({
      'data-zoom-plane': 'duplicate',
      'data-section': 'page-two',
      'data-width': '1',
      'data-height': '1',
      'data-position': '1, 0, 0',
      'data-rotation': '0, 0, 0',
    });

    expect(() => parseAllZoomPlanes(liteBackend, createContainer([first, second]))).toThrow(/Duplicate/);

    const centerOne = createZoomPlaneElement({
      'data-zoom-plane': 'center-one',
      'data-section': 'page-one',
      'data-width': '1',
      'data-height': '1',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
      'data-zoom-center': '',
    });
    const centerTwo = createZoomPlaneElement({
      'data-zoom-plane': 'center-two',
      'data-section': 'page-two',
      'data-width': '1',
      'data-height': '1',
      'data-position': '1, 0, 0',
      'data-rotation': '0, 0, 0',
      'data-zoom-center': '',
    });

    expect(() => parseAllZoomPlanes(liteBackend, createContainer([centerOne, centerTwo]))).toThrow(/Multiple center/);
  });

  it('tiles right and left panels from an unrotated reference', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const right = createZoomPlaneElement({
      'data-zoom-plane': 'right',
      'data-section': 'page-right',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-right': 'center',
      'data-tile-angle': '30',
    });
    const left = createZoomPlaneElement({
      'data-zoom-plane': 'left',
      'data-section': 'page-left',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-left': 'center',
      'data-tile-angle': '30',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([center, right, left]), { scale });
    const centerConfig = getPlane(configs, 'center');
    const rightConfig = getPlane(configs, 'right');
    const leftConfig = getPlane(configs, 'left');

    expectVectorClose(
      edgeCenter(rightConfig, 'left', scale),
      edgeCenter(centerConfig, 'right', scale)
    );
    expectVectorClose(
      edgeCenter(leftConfig, 'right', scale),
      edgeCenter(centerConfig, 'left', scale)
    );
    expect(rightConfig.rotation[1]).toBeCloseTo(-Math.PI / 6);
    expect(leftConfig.rotation[1]).toBeCloseTo(Math.PI / 6);
  });

  it('tiles top and bottom panels from an unrotated reference', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const top = createZoomPlaneElement({
      'data-zoom-plane': 'top',
      'data-section': 'page-top',
      'data-width': '1000',
      'data-height': '500',
      'data-tile-from-top': 'center',
      'data-tile-angle': '30',
    });
    const bottom = createZoomPlaneElement({
      'data-zoom-plane': 'bottom',
      'data-section': 'page-bottom',
      'data-width': '1000',
      'data-height': '500',
      'data-tile-from-bottom': 'center',
      'data-tile-angle': '30',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([center, top, bottom]), { scale });
    const centerConfig = getPlane(configs, 'center');
    const topConfig = getPlane(configs, 'top');
    const bottomConfig = getPlane(configs, 'bottom');

    expectVectorClose(
      edgeCenter(topConfig, 'bottom', scale),
      edgeCenter(centerConfig, 'top', scale)
    );
    expectVectorClose(
      edgeCenter(bottomConfig, 'top', scale),
      edgeCenter(centerConfig, 'bottom', scale)
    );
    expect(topConfig.rotation[0]).toBeCloseTo(Math.PI / 6);
    expect(bottomConfig.rotation[0]).toBeCloseTo(-Math.PI / 6);
  });

  it('tiles from an already rotated reference by aligning shared world-space edges', () => {
    const scale = 0.5;
    const reference = createZoomPlaneElement({
      'data-zoom-plane': 'reference',
      'data-section': 'page-reference',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '10, 20, 30',
      'data-rotation': '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      'data-zoom-plane': 'tiled',
      'data-section': 'page-tiled',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-right': 'reference',
      'data-tile-angle': '35',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([reference, tiled]), { scale });
    const referenceConfig = getPlane(configs, 'reference');
    const tiledConfig = getPlane(configs, 'tiled');

    expectVectorClose(
      edgeCenter(tiledConfig, 'left', scale),
      edgeCenter(referenceConfig, 'right', scale)
    );
  });

  it('applies tile offset in the reference plane local axes', () => {
    const scale = 0.5;
    const reference = createZoomPlaneElement({
      'data-zoom-plane': 'reference',
      'data-section': 'page-reference',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '10, 20, 30',
      'data-rotation': '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      'data-zoom-plane': 'tiled',
      'data-section': 'page-tiled',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-right': 'reference',
      'data-tile-angle': '35',
      'data-tile-offset': '40, -20',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([reference, tiled]), { scale });
    const referenceConfig = getPlane(configs, 'reference');
    const tiledConfig = getPlane(configs, 'tiled');
    const expectedHinge = edgeCenter(referenceConfig, 'right', scale)
      .add(referenceLocalOffset(referenceConfig, 40, -20));

    expectVectorClose(edgeCenter(tiledConfig, 'left', scale), expectedHinge);
  });

  it('applies tile gap away from the reference edge for every side', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const right = createZoomPlaneElement({
      'data-zoom-plane': 'right',
      'data-section': 'page-right',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-right': 'center',
      'data-tile-angle': '30',
      'data-tile-gap': '40',
    });
    const left = createZoomPlaneElement({
      'data-zoom-plane': 'left',
      'data-section': 'page-left',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-left': 'center',
      'data-tile-angle': '30',
      'data-tile-gap': '40',
    });
    const top = createZoomPlaneElement({
      'data-zoom-plane': 'top',
      'data-section': 'page-top',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-top': 'center',
      'data-tile-angle': '30',
      'data-tile-gap': '40',
    });
    const bottom = createZoomPlaneElement({
      'data-zoom-plane': 'bottom',
      'data-section': 'page-bottom',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-bottom': 'center',
      'data-tile-angle': '30',
      'data-tile-gap': '40',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([center, right, left, top, bottom]), { scale });
    const centerConfig = getPlane(configs, 'center');

    expectVectorClose(
      edgeCenter(getPlane(configs, 'right'), 'left', scale),
      edgeCenter(centerConfig, 'right', scale).add(referenceLocalOffset(centerConfig, 40, 0))
    );
    expectVectorClose(
      edgeCenter(getPlane(configs, 'left'), 'right', scale),
      edgeCenter(centerConfig, 'left', scale).add(referenceLocalOffset(centerConfig, -40, 0))
    );
    expectVectorClose(
      edgeCenter(getPlane(configs, 'top'), 'bottom', scale),
      edgeCenter(centerConfig, 'top', scale).add(referenceLocalOffset(centerConfig, 0, 40))
    );
    expectVectorClose(
      edgeCenter(getPlane(configs, 'bottom'), 'top', scale),
      edgeCenter(centerConfig, 'bottom', scale).add(referenceLocalOffset(centerConfig, 0, -40))
    );
  });

  it('aligns top and bottom edges for right-side tiled panels with different sizes', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1600',
      'data-height': '900',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const topAligned = createZoomPlaneElement({
      'data-zoom-plane': 'top-aligned',
      'data-section': 'page-top-aligned',
      'data-width': '1200',
      'data-height': '600',
      'data-tile-from-right': 'center',
      'data-tile-angle': '30',
      'data-tile-align': 'top',
    });
    const bottomAligned = createZoomPlaneElement({
      'data-zoom-plane': 'bottom-aligned',
      'data-section': 'page-bottom-aligned',
      'data-width': '1200',
      'data-height': '600',
      'data-tile-from-right': 'center',
      'data-tile-angle': '30',
      'data-tile-align': 'bottom',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([center, topAligned, bottomAligned]), { scale });
    const centerConfig = getPlane(configs, 'center');
    const up = localAxis(centerConfig, 'up');

    expectSameProjectionOnAxis(
      edgeCenter(getPlane(configs, 'top-aligned'), 'top', scale),
      edgeCenter(centerConfig, 'top', scale),
      up
    );
    expectSameProjectionOnAxis(
      edgeCenter(getPlane(configs, 'bottom-aligned'), 'bottom', scale),
      edgeCenter(centerConfig, 'bottom', scale),
      up
    );
  });

  it('aligns left and right edges for top-side tiled panels with different sizes', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1600',
      'data-height': '900',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const leftAligned = createZoomPlaneElement({
      'data-zoom-plane': 'left-aligned',
      'data-section': 'page-left-aligned',
      'data-width': '900',
      'data-height': '600',
      'data-tile-from-top': 'center',
      'data-tile-angle': '30',
      'data-tile-align': 'left',
    });
    const rightAligned = createZoomPlaneElement({
      'data-zoom-plane': 'right-aligned',
      'data-section': 'page-right-aligned',
      'data-width': '900',
      'data-height': '600',
      'data-tile-from-top': 'center',
      'data-tile-angle': '30',
      'data-tile-align': 'right',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([center, leftAligned, rightAligned]), { scale });
    const centerConfig = getPlane(configs, 'center');
    const rightAxis = localAxis(centerConfig, 'right');

    expectSameProjectionOnAxis(
      edgeCenter(getPlane(configs, 'left-aligned'), 'left', scale),
      edgeCenter(centerConfig, 'left', scale),
      rightAxis
    );
    expectSameProjectionOnAxis(
      edgeCenter(getPlane(configs, 'right-aligned'), 'right', scale),
      edgeCenter(centerConfig, 'right', scale),
      rightAxis
    );
  });

  it('combines ergonomic alignment, align offset, gap, and manual tile offset', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1600',
      'data-height': '900',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const tiled = createZoomPlaneElement({
      'data-zoom-plane': 'tiled',
      'data-section': 'page-tiled',
      'data-width': '1200',
      'data-height': '600',
      'data-tile-from-right': 'center',
      'data-tile-angle': '30',
      'data-tile-gap': '40',
      'data-tile-align': 'top',
      'data-tile-align-offset': '-10',
      'data-tile-offset': '5, 2',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([center, tiled]), { scale });
    const centerConfig = getPlane(configs, 'center');
    const tiledConfig = getPlane(configs, 'tiled');
    const alignY = ((centerConfig.height - tiledConfig.height) * scale) / 2;
    const expectedHinge = edgeCenter(centerConfig, 'right', scale)
      .add(referenceLocalOffset(centerConfig, 45, alignY - 8));

    expectVectorClose(edgeCenter(tiledConfig, 'left', scale), expectedHinge);
  });

  it('applies tile rotation offset relative to the reference orientation', () => {
    const scale = 0.5;
    const reference = createZoomPlaneElement({
      'data-zoom-plane': 'reference',
      'data-section': 'page-reference',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '10, 20, 30',
      'data-rotation': '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      'data-zoom-plane': 'tiled',
      'data-section': 'page-tiled',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-right': 'reference',
      'data-tile-angle': '35',
      'data-tile-rotation-offset': '0, 2, -1',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([reference, tiled]), { scale });
    const referenceConfig = getPlane(configs, 'reference');
    const tiledConfig = getPlane(configs, 'tiled');
    const referenceQuaternion = quaternionFromConfig(referenceConfig);
    const offsetQuaternion = new Quaternion().setFromEuler(
      new Euler(0, 2 * Math.PI / 180, -Math.PI / 180, 'XYZ')
    );
    const foldQuaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      -35 * Math.PI / 180
    );
    const expectedQuaternion = referenceQuaternion.clone()
      .multiply(offsetQuaternion)
      .multiply(foldQuaternion);

    expectQuaternionClose(quaternionFromConfig(tiledConfig), expectedQuaternion);
    expectVectorClose(
      edgeCenter(tiledConfig, 'left', scale),
      edgeCenter(referenceConfig, 'right', scale)
    );
  });

  it('combines tile offset and rotation offset while keeping the offset hinge anchored', () => {
    const scale = 0.5;
    const reference = createZoomPlaneElement({
      'data-zoom-plane': 'reference',
      'data-section': 'page-reference',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '10, 20, 30',
      'data-rotation': '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      'data-zoom-plane': 'tiled',
      'data-section': 'page-tiled',
      'data-width': '800',
      'data-height': '500',
      'data-tile-from-top': 'reference',
      'data-tile-angle': '20',
      'data-tile-offset': '-15, 35',
      'data-tile-rotation-offset': '1, 0, 3',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([reference, tiled]), { scale });
    const referenceConfig = getPlane(configs, 'reference');
    const tiledConfig = getPlane(configs, 'tiled');
    const expectedHinge = edgeCenter(referenceConfig, 'top', scale)
      .add(referenceLocalOffset(referenceConfig, -15, 35));

    expectVectorClose(edgeCenter(tiledConfig, 'bottom', scale), expectedHinge);
  });

  it('supports chained tiled references and references declared later in the DOM', () => {
    const scale = 0.5;
    const second = createZoomPlaneElement({
      'data-zoom-plane': 'second',
      'data-section': 'page-second',
      'data-width': '1000',
      'data-height': '500',
      'data-tile-from-right': 'first',
      'data-tile-angle': '20',
    });
    const first = createZoomPlaneElement({
      'data-zoom-plane': 'first',
      'data-section': 'page-first',
      'data-width': '1000',
      'data-height': '500',
      'data-tile-from-right': 'base',
      'data-tile-angle': '20',
    });
    const base = createZoomPlaneElement({
      'data-zoom-plane': 'base',
      'data-section': 'page-base',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });

    const configs = parseAllZoomPlanes(liteBackend, createContainer([second, first, base]), { scale });
    const baseConfig = getPlane(configs, 'base');
    const firstConfig = getPlane(configs, 'first');
    const secondConfig = getPlane(configs, 'second');

    expectVectorClose(
      edgeCenter(firstConfig, 'left', scale),
      edgeCenter(baseConfig, 'right', scale)
    );
    expectVectorClose(
      edgeCenter(secondConfig, 'left', scale),
      edgeCenter(firstConfig, 'right', scale)
    );
  });

  it.each([
    ['missing reference', { 'data-tile-from-right': 'missing', 'data-tile-angle': '30' }, /not found/],
    ['self reference', { 'data-tile-from-right': 'invalid', 'data-tile-angle': '30' }, /itself/],
    ['invalid angle', { 'data-tile-from-right': 'center', 'data-tile-angle': '30deg' }, /Invalid number/],
    ['invalid offset length', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-offset': '1, 2, 3' }, /Expected 2/],
    ['invalid offset number', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-offset': '1px, 2' }, /Invalid number/],
    ['invalid rotation offset length', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-rotation-offset': '1, 2' }, /Expected 3/],
    ['invalid rotation offset number', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-rotation-offset': '1, nope, 3' }, /Invalid number/],
    ['invalid gap', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-gap': '1px' }, /invalid tileGap/],
    ['invalid align offset', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-align-offset': 'nope' }, /invalid tileAlignOffset/],
    ['invalid align value', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-align': 'middle' }, /invalid tileAlign/],
    ['invalid horizontal align for side tile', { 'data-tile-from-right': 'center', 'data-tile-angle': '30', 'data-tile-align': 'left' }, /invalid for right tiling/],
    ['invalid vertical align for top tile', { 'data-tile-from-top': 'center', 'data-tile-angle': '30', 'data-tile-align': 'top' }, /invalid for top tiling/],
    ['multiple tile sides', { 'data-tile-from-right': 'center', 'data-tile-from-left': 'center', 'data-tile-angle': '30' }, /exactly one/],
    ['mixed explicit and tiled', { 'data-position': '0, 0, 0', 'data-rotation': '0, 0, 0', 'data-tile-from-right': 'center', 'data-tile-angle': '30' }, /cannot mix/],
  ])('rejects invalid tiled layout: %s', (_caseName, invalidValues, errorPattern) => {
    const center = createZoomPlaneElement({
      'data-zoom-plane': 'center',
      'data-section': 'page-center',
      'data-width': '1000',
      'data-height': '500',
      'data-position': '0, 0, 0',
      'data-rotation': '0, 0, 0',
    });
    const invalid = createZoomPlaneElement({
      'data-zoom-plane': 'invalid',
      'data-section': 'page-invalid',
      'data-width': '1000',
      'data-height': '500',
      ...invalidValues,
    });

    expect(() => parseAllZoomPlanes(liteBackend, createContainer([center, invalid]))).toThrow(errorPattern);
  });

  it('rejects circular tiled layout references', () => {
    const first = createZoomPlaneElement({
      'data-zoom-plane': 'first',
      'data-section': 'page-first',
      'data-width': '1000',
      'data-height': '500',
      'data-tile-from-right': 'second',
      'data-tile-angle': '30',
    });
    const second = createZoomPlaneElement({
      'data-zoom-plane': 'second',
      'data-section': 'page-second',
      'data-width': '1000',
      'data-height': '500',
      'data-tile-from-right': 'first',
      'data-tile-angle': '30',
    });

    expect(() => parseAllZoomPlanes(liteBackend, createContainer([first, second]))).toThrow(/circular/);
  });
});
