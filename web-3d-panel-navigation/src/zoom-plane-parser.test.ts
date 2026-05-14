import { parseAllZoomPlanes, parseZoomPlane } from './zoom-plane-parser';
import type { ZoomPlaneConfig } from './types';
import { Vector3, Quaternion, Euler } from 'three';

type Dataset = Record<string, string | undefined>;

function createZoomPlaneElement(
  dataset: Dataset,
  attributes: string[] = []
): HTMLElement {
  return {
    dataset,
    hasAttribute: (name: string) => attributes.includes(name),
  } as unknown as HTMLElement;
}

function createContainer(elements: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll: () => elements,
  } as unknown as HTMLElement;
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
      zoomPlane: 'valid',
      section: 'page-valid',
      width: '1.2e3',
      height: '.5',
      position: '-1, +2.5, 3e2',
      rotation: '0, -45, 1e1',
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
    ['suffixed width', { width: '100px', height: '1', position: '0, 0, 0', rotation: '0, 0, 0' }],
    ['suffixed position', { width: '1', height: '1', position: '0, 10abc, 0', rotation: '0, 0, 0' }],
    ['infinite rotation', { width: '1', height: '1', position: '0, 0, 0', rotation: '0, Infinity, 0' }],
    ['hex width', { width: '0x10', height: '1', position: '0, 0, 0', rotation: '0, 0, 0' }],
    ['non-positive height', { width: '1', height: '0', position: '0, 0, 0', rotation: '0, 0, 0' }],
  ])('rejects malformed numeric attributes: %s', (_caseName, values) => {
    expect(() => parseZoomPlane(createZoomPlaneElement({
      zoomPlane: 'invalid',
      section: 'page-invalid',
      ...values,
    }))).toThrow();
  });

  it('rejects duplicate plane IDs and multiple focal planes', () => {
    const first = createZoomPlaneElement({
      zoomPlane: 'duplicate',
      section: 'page-one',
      width: '1',
      height: '1',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const second = createZoomPlaneElement({
      zoomPlane: 'duplicate',
      section: 'page-two',
      width: '1',
      height: '1',
      position: '1, 0, 0',
      rotation: '0, 0, 0',
    });

    expect(() => parseAllZoomPlanes(createContainer([first, second]))).toThrow(/Duplicate/);

    const centerOne = createZoomPlaneElement({
      zoomPlane: 'center-one',
      section: 'page-one',
      width: '1',
      height: '1',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    }, ['data-zoom-center']);
    const centerTwo = createZoomPlaneElement({
      zoomPlane: 'center-two',
      section: 'page-two',
      width: '1',
      height: '1',
      position: '1, 0, 0',
      rotation: '0, 0, 0',
    }, ['data-zoom-center']);

    expect(() => parseAllZoomPlanes(createContainer([centerOne, centerTwo]))).toThrow(/Multiple center/);
  });

  it('tiles right and left panels from an unrotated reference', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      zoomPlane: 'center',
      section: 'page-center',
      width: '1000',
      height: '500',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const right = createZoomPlaneElement({
      zoomPlane: 'right',
      section: 'page-right',
      width: '800',
      height: '500',
      tileFromRight: 'center',
      tileAngle: '30',
    });
    const left = createZoomPlaneElement({
      zoomPlane: 'left',
      section: 'page-left',
      width: '800',
      height: '500',
      tileFromLeft: 'center',
      tileAngle: '30',
    });

    const configs = parseAllZoomPlanes(createContainer([center, right, left]), { scale });
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
      zoomPlane: 'center',
      section: 'page-center',
      width: '1000',
      height: '500',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const top = createZoomPlaneElement({
      zoomPlane: 'top',
      section: 'page-top',
      width: '1000',
      height: '500',
      tileFromTop: 'center',
      tileAngle: '30',
    });
    const bottom = createZoomPlaneElement({
      zoomPlane: 'bottom',
      section: 'page-bottom',
      width: '1000',
      height: '500',
      tileFromBottom: 'center',
      tileAngle: '30',
    });

    const configs = parseAllZoomPlanes(createContainer([center, top, bottom]), { scale });
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
      zoomPlane: 'reference',
      section: 'page-reference',
      width: '1000',
      height: '500',
      position: '10, 20, 30',
      rotation: '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      zoomPlane: 'tiled',
      section: 'page-tiled',
      width: '800',
      height: '500',
      tileFromRight: 'reference',
      tileAngle: '35',
    });

    const configs = parseAllZoomPlanes(createContainer([reference, tiled]), { scale });
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
      zoomPlane: 'reference',
      section: 'page-reference',
      width: '1000',
      height: '500',
      position: '10, 20, 30',
      rotation: '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      zoomPlane: 'tiled',
      section: 'page-tiled',
      width: '800',
      height: '500',
      tileFromRight: 'reference',
      tileAngle: '35',
      tileOffset: '40, -20',
    });

    const configs = parseAllZoomPlanes(createContainer([reference, tiled]), { scale });
    const referenceConfig = getPlane(configs, 'reference');
    const tiledConfig = getPlane(configs, 'tiled');
    const expectedHinge = edgeCenter(referenceConfig, 'right', scale)
      .add(referenceLocalOffset(referenceConfig, 40, -20));

    expectVectorClose(edgeCenter(tiledConfig, 'left', scale), expectedHinge);
  });

  it('applies tile gap away from the reference edge for every side', () => {
    const scale = 0.5;
    const center = createZoomPlaneElement({
      zoomPlane: 'center',
      section: 'page-center',
      width: '1000',
      height: '500',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const right = createZoomPlaneElement({
      zoomPlane: 'right',
      section: 'page-right',
      width: '800',
      height: '500',
      tileFromRight: 'center',
      tileAngle: '30',
      tileGap: '40',
    });
    const left = createZoomPlaneElement({
      zoomPlane: 'left',
      section: 'page-left',
      width: '800',
      height: '500',
      tileFromLeft: 'center',
      tileAngle: '30',
      tileGap: '40',
    });
    const top = createZoomPlaneElement({
      zoomPlane: 'top',
      section: 'page-top',
      width: '800',
      height: '500',
      tileFromTop: 'center',
      tileAngle: '30',
      tileGap: '40',
    });
    const bottom = createZoomPlaneElement({
      zoomPlane: 'bottom',
      section: 'page-bottom',
      width: '800',
      height: '500',
      tileFromBottom: 'center',
      tileAngle: '30',
      tileGap: '40',
    });

    const configs = parseAllZoomPlanes(createContainer([center, right, left, top, bottom]), { scale });
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
      zoomPlane: 'center',
      section: 'page-center',
      width: '1600',
      height: '900',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const topAligned = createZoomPlaneElement({
      zoomPlane: 'top-aligned',
      section: 'page-top-aligned',
      width: '1200',
      height: '600',
      tileFromRight: 'center',
      tileAngle: '30',
      tileAlign: 'top',
    });
    const bottomAligned = createZoomPlaneElement({
      zoomPlane: 'bottom-aligned',
      section: 'page-bottom-aligned',
      width: '1200',
      height: '600',
      tileFromRight: 'center',
      tileAngle: '30',
      tileAlign: 'bottom',
    });

    const configs = parseAllZoomPlanes(createContainer([center, topAligned, bottomAligned]), { scale });
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
      zoomPlane: 'center',
      section: 'page-center',
      width: '1600',
      height: '900',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const leftAligned = createZoomPlaneElement({
      zoomPlane: 'left-aligned',
      section: 'page-left-aligned',
      width: '900',
      height: '600',
      tileFromTop: 'center',
      tileAngle: '30',
      tileAlign: 'left',
    });
    const rightAligned = createZoomPlaneElement({
      zoomPlane: 'right-aligned',
      section: 'page-right-aligned',
      width: '900',
      height: '600',
      tileFromTop: 'center',
      tileAngle: '30',
      tileAlign: 'right',
    });

    const configs = parseAllZoomPlanes(createContainer([center, leftAligned, rightAligned]), { scale });
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
      zoomPlane: 'center',
      section: 'page-center',
      width: '1600',
      height: '900',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const tiled = createZoomPlaneElement({
      zoomPlane: 'tiled',
      section: 'page-tiled',
      width: '1200',
      height: '600',
      tileFromRight: 'center',
      tileAngle: '30',
      tileGap: '40',
      tileAlign: 'top',
      tileAlignOffset: '-10',
      tileOffset: '5, 2',
    });

    const configs = parseAllZoomPlanes(createContainer([center, tiled]), { scale });
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
      zoomPlane: 'reference',
      section: 'page-reference',
      width: '1000',
      height: '500',
      position: '10, 20, 30',
      rotation: '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      zoomPlane: 'tiled',
      section: 'page-tiled',
      width: '800',
      height: '500',
      tileFromRight: 'reference',
      tileAngle: '35',
      tileRotationOffset: '0, 2, -1',
    });

    const configs = parseAllZoomPlanes(createContainer([reference, tiled]), { scale });
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
      zoomPlane: 'reference',
      section: 'page-reference',
      width: '1000',
      height: '500',
      position: '10, 20, 30',
      rotation: '10, 45, 5',
    });
    const tiled = createZoomPlaneElement({
      zoomPlane: 'tiled',
      section: 'page-tiled',
      width: '800',
      height: '500',
      tileFromTop: 'reference',
      tileAngle: '20',
      tileOffset: '-15, 35',
      tileRotationOffset: '1, 0, 3',
    });

    const configs = parseAllZoomPlanes(createContainer([reference, tiled]), { scale });
    const referenceConfig = getPlane(configs, 'reference');
    const tiledConfig = getPlane(configs, 'tiled');
    const expectedHinge = edgeCenter(referenceConfig, 'top', scale)
      .add(referenceLocalOffset(referenceConfig, -15, 35));

    expectVectorClose(edgeCenter(tiledConfig, 'bottom', scale), expectedHinge);
  });

  it('supports chained tiled references and references declared later in the DOM', () => {
    const scale = 0.5;
    const second = createZoomPlaneElement({
      zoomPlane: 'second',
      section: 'page-second',
      width: '1000',
      height: '500',
      tileFromRight: 'first',
      tileAngle: '20',
    });
    const first = createZoomPlaneElement({
      zoomPlane: 'first',
      section: 'page-first',
      width: '1000',
      height: '500',
      tileFromRight: 'base',
      tileAngle: '20',
    });
    const base = createZoomPlaneElement({
      zoomPlane: 'base',
      section: 'page-base',
      width: '1000',
      height: '500',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });

    const configs = parseAllZoomPlanes(createContainer([second, first, base]), { scale });
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
    ['missing reference', { tileFromRight: 'missing', tileAngle: '30' }, /not found/],
    ['self reference', { tileFromRight: 'invalid', tileAngle: '30' }, /itself/],
    ['invalid angle', { tileFromRight: 'center', tileAngle: '30deg' }, /Invalid number/],
    ['invalid offset length', { tileFromRight: 'center', tileAngle: '30', tileOffset: '1, 2, 3' }, /Expected 2/],
    ['invalid offset number', { tileFromRight: 'center', tileAngle: '30', tileOffset: '1px, 2' }, /Invalid number/],
    ['invalid rotation offset length', { tileFromRight: 'center', tileAngle: '30', tileRotationOffset: '1, 2' }, /Expected 3/],
    ['invalid rotation offset number', { tileFromRight: 'center', tileAngle: '30', tileRotationOffset: '1, nope, 3' }, /Invalid number/],
    ['invalid gap', { tileFromRight: 'center', tileAngle: '30', tileGap: '1px' }, /invalid tileGap/],
    ['invalid align offset', { tileFromRight: 'center', tileAngle: '30', tileAlignOffset: 'nope' }, /invalid tileAlignOffset/],
    ['invalid align value', { tileFromRight: 'center', tileAngle: '30', tileAlign: 'middle' }, /invalid tileAlign/],
    ['invalid horizontal align for side tile', { tileFromRight: 'center', tileAngle: '30', tileAlign: 'left' }, /invalid for right tiling/],
    ['invalid vertical align for top tile', { tileFromTop: 'center', tileAngle: '30', tileAlign: 'top' }, /invalid for top tiling/],
    ['multiple tile sides', { tileFromRight: 'center', tileFromLeft: 'center', tileAngle: '30' }, /exactly one/],
    ['mixed explicit and tiled', { position: '0, 0, 0', rotation: '0, 0, 0', tileFromRight: 'center', tileAngle: '30' }, /cannot mix/],
  ])('rejects invalid tiled layout: %s', (_caseName, invalidValues, errorPattern) => {
    const center = createZoomPlaneElement({
      zoomPlane: 'center',
      section: 'page-center',
      width: '1000',
      height: '500',
      position: '0, 0, 0',
      rotation: '0, 0, 0',
    });
    const invalid = createZoomPlaneElement({
      zoomPlane: 'invalid',
      section: 'page-invalid',
      width: '1000',
      height: '500',
      ...invalidValues,
    });

    expect(() => parseAllZoomPlanes(createContainer([center, invalid]))).toThrow(errorPattern);
  });

  it('rejects circular tiled layout references', () => {
    const first = createZoomPlaneElement({
      zoomPlane: 'first',
      section: 'page-first',
      width: '1000',
      height: '500',
      tileFromRight: 'second',
      tileAngle: '30',
    });
    const second = createZoomPlaneElement({
      zoomPlane: 'second',
      section: 'page-second',
      width: '1000',
      height: '500',
      tileFromRight: 'first',
      tileAngle: '30',
    });

    expect(() => parseAllZoomPlanes(createContainer([first, second]))).toThrow(/circular/);
  });
});
