import { parseAllZoomPlanes, parseZoomPlane } from './zoom-plane-parser';

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
});
