import { parseAllZoomPlanes, parseZoomPlane } from './zoom-plane-parser';
import type { ZoomPlaneConfig } from './types';
import * as THREE from 'three';

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

function expectVectorClose(actual: THREE.Vector3, expected: THREE.Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

function edgeCenter(
  config: ZoomPlaneConfig,
  side: 'left' | 'right' | 'top' | 'bottom',
  scale: number
): THREE.Vector3 {
  const center = new THREE.Vector3(
    config.position[0],
    config.position[1],
    config.position[2]
  );
  const euler = new THREE.Euler(config.rotation[0], config.rotation[1], config.rotation[2]);
  const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);
  const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);

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
