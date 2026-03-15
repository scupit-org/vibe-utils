import type { ZoomPlaneConfig } from './types';

/**
 * Parse a comma-separated string of numbers into an array.
 * Handles whitespace around values.
 *
 * @param value - String like "10, 20, 30"
 * @param expectedLength - Expected number of values
 * @returns Array of numbers
 * @throws Error if parsing fails or wrong number of values
 */
function parseNumberArray(value: string, expectedLength: number): number[] {
  const parts = value.split(',').map(s => s.trim());

  if (parts.length !== expectedLength) {
    throw new Error(
      `Expected ${expectedLength} values, got ${parts.length}: "${value}"`
    );
  }

  const numbers = parts.map((part, index) => {
    const num = parseFloat(part);
    if (isNaN(num)) {
      throw new Error(`Invalid number at position ${index}: "${part}"`);
    }
    return num;
  });

  return numbers;
}

/**
 * Convert degrees to radians
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Parse a comma-separated string into a three-element tuple.
 * Optionally applies a mapper function to each number.
 */
function parseToThreeTuple(
  value: string,
  id: string,
  attributeName: string,
  mapper: (n: number) => number = (n: number) => n
): [number, number, number] {
  try {
    const arr: number[] = parseNumberArray(value, 3);
    return (mapper ? arr.map(mapper) : arr) as [number, number, number];
  } catch (e) {
    throw new Error(
      `Zoom plane "${id}": invalid ${attributeName} "${value}" - ${(e as Error).message}`
    );
  }
}

function parseValidPositiveFloat(value: string, id: string, attributeName: string): number {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) {
    throw new RangeError(`Zoom plane "${id}": invalid ${attributeName} "${value}"`);
  }
  return num;
}

function extractRequiredDataAttribute(element: HTMLElement, id: string, attr: string): string {
  const value = element.dataset[attr];
  if (!value) {
    throw new ReferenceError(`Zoom plane "${id}": missing data-${attr} attribute`);
  }
  return value;
}

/**
 * Parse a single HTML element into a ZoomPlaneConfig.
 *
 * Required data attributes:
 * - data-zoom-plane: unique identifier
 * - data-section: ID of the page section to reveal
 * - data-width: plane width in world units
 * - data-height: plane height in world units
 * - data-position: "x, y, z" position in 3D space
 * - data-rotation: "x, y, z" rotation in degrees
 *
 * Optional data attributes:
 * - data-zoom-center: marks this plane as the focal element for camera alignment
 */
export function parseZoomPlane(element: HTMLElement): ZoomPlaneConfig {
  const id = element.dataset.zoomPlane;
  if (!id) {
    throw new ReferenceError(`Zoom plane: missing data-zoom-plane attribute`);
  }

  const widthStr: string = extractRequiredDataAttribute(element, id, 'width');
  const heightStr: string = extractRequiredDataAttribute(element, id, 'height');
  const positionStr: string = extractRequiredDataAttribute(element, id, 'position');
  const rotationStr: string = extractRequiredDataAttribute(element, id, 'rotation');

  return {
    id,
    sectionId: extractRequiredDataAttribute(element, id, 'section'),
    width: parseValidPositiveFloat(widthStr, id, 'width'),
    height: parseValidPositiveFloat(heightStr, id, 'height'),
    position: parseToThreeTuple(positionStr, id, 'position'),
    rotation: parseToThreeTuple(rotationStr, id, 'rotation', degreesToRadians),
    element,
    isCenter: element.hasAttribute('data-zoom-center'),
  };
}

/**
 * Parse all zoom plane elements within a container.
 *
 * @param container - Container element to search within
 * @param selector - CSS selector for zoom plane elements (default: '[data-zoom-plane]')
 * @returns Array of parsed ZoomPlaneConfig objects
 * @throws Error if any plane fails to parse, or if multiple center elements exist
 */
export function parseAllZoomPlanes(
  container: HTMLElement,
  selector: string = '[data-zoom-plane]'
): ZoomPlaneConfig[] {
  const elements = container.querySelectorAll<HTMLElement>(selector);
  const configs: ZoomPlaneConfig[] = [];
  const seenIds = new Set<string>();
  let centerPlaneId: string | null = null;

  elements.forEach((element, index) => {
    try {
      const config = parseZoomPlane(element);

      if (seenIds.has(config.id)) {
        throw new Error(`Duplicate zoom plane ID: "${config.id}"`);
      }
      seenIds.add(config.id);

      if (config.isCenter) {
        if (centerPlaneId !== null) {
          throw new Error(
            `Multiple center zoom planes found: "${centerPlaneId}" and "${config.id}". ` +
            `Only one zoom plane can have the data-zoom-center attribute.`
          );
        }
        centerPlaneId = config.id;
      }

      configs.push(config);
    } catch (e) {
      console.error(`Failed to parse zoom plane at index ${index}:`, e);
      throw e;
    }
  });

  return configs;
}

/**
 * Find the center zoom plane from an array of configs.
 */
export function findCenterZoomPlane(
  configs: ZoomPlaneConfig[]
): ZoomPlaneConfig | undefined {
  return configs.find(c => c.isCenter);
}

/**
 * Find a zoom plane config by ID from an array of configs.
 */
export function findZoomPlane(
  configs: ZoomPlaneConfig[],
  id: string
): ZoomPlaneConfig | undefined {
  return configs.find(c => c.id === id);
}
