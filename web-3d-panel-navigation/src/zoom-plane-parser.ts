import * as THREE from 'three';
import type { ZoomPlaneConfig } from './types';

type TileSide = 'right' | 'left' | 'top' | 'bottom';
type TileAlign = 'top' | 'center' | 'bottom' | 'left' | 'right';

interface ExplicitPlaneDefinition {
  layout: 'explicit';
  position: [number, number, number];
  rotation: [number, number, number];
}

interface TiledPlaneDefinition {
  layout: 'tiled';
  side: TileSide;
  refId: string;
  angle: number;
  offset: [number, number];
  rotationOffset: [number, number, number];
  gap: number;
  align: TileAlign;
  alignOffset: number;
}

interface PlaneDefinition {
  id: string;
  sectionId: string;
  width: number;
  height: number;
  element: HTMLElement;
  isCenter: boolean;
  layout: ExplicitPlaneDefinition | TiledPlaneDefinition;
}

export interface ParseAllZoomPlanesOptions {
  selector?: string;
  scale?: number;
}

const TILE_SIDE_ATTRIBUTES: Array<{ side: TileSide; datasetKey: string; attribute: string }> = [
  { side: 'right', datasetKey: 'tileFromRight', attribute: 'data-tile-from-right' },
  { side: 'left', datasetKey: 'tileFromLeft', attribute: 'data-tile-from-left' },
  { side: 'top', datasetKey: 'tileFromTop', attribute: 'data-tile-from-top' },
  { side: 'bottom', datasetKey: 'tileFromBottom', attribute: 'data-tile-from-bottom' },
];

const STRICT_NUMBER_PATTERN = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

function parseStrictFiniteNumber(value: string): number {
  const trimmedValue = value.trim();
  if (!STRICT_NUMBER_PATTERN.test(trimmedValue)) {
    throw new Error(`Invalid number "${value}"`);
  }

  const num = Number(trimmedValue);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid finite number "${value}"`);
  }

  return num;
}

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
    try {
      return parseStrictFiniteNumber(part);
    } catch {
      throw new Error(`Invalid number at position ${index}: "${part}"`);
    }
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

function parseToTwoTuple(
  value: string,
  id: string,
  attributeName: string
): [number, number] {
  try {
    const arr: number[] = parseNumberArray(value, 2);
    return arr as [number, number];
  } catch (e) {
    throw new Error(
      `Zoom plane "${id}": invalid ${attributeName} "${value}" - ${(e as Error).message}`
    );
  }
}

function parseValidPositiveFloat(value: string, id: string, attributeName: string): number {
  let num: number;
  try {
    num = parseStrictFiniteNumber(value);
  } catch {
    throw new RangeError(`Zoom plane "${id}": invalid ${attributeName} "${value}"`);
  }

  if (num <= 0) {
    throw new RangeError(`Zoom plane "${id}": invalid ${attributeName} "${value}"`);
  }
  return num;
}

function parseFiniteDataAttribute(value: string, id: string, attributeName: string): number {
  try {
    return parseStrictFiniteNumber(value);
  } catch (e) {
    throw new Error(
      `Zoom plane "${id}": invalid ${attributeName} "${value}" - ${(e as Error).message}`
    );
  }
}

function extractRequiredDataAttribute(element: HTMLElement, id: string, attr: string): string {
  const value = element.dataset[attr];
  if (!value) {
    throw new ReferenceError(`Zoom plane "${id}": missing data-${attr} attribute`);
  }
  return value;
}

function hasDatasetKey(element: HTMLElement, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(element.dataset, key);
}

function parseTileAlign(value: string, id: string): TileAlign {
  if (
    value === 'top' ||
    value === 'center' ||
    value === 'bottom' ||
    value === 'left' ||
    value === 'right'
  ) {
    return value;
  }

  throw new Error(`Zoom plane "${id}": invalid tileAlign "${value}"`);
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

function parsePlaneDefinition(element: HTMLElement): PlaneDefinition {
  const id = element.dataset.zoomPlane;
  if (!id) {
    throw new ReferenceError(`Zoom plane: missing data-zoom-plane attribute`);
  }

  const widthStr: string = extractRequiredDataAttribute(element, id, 'width');
  const heightStr: string = extractRequiredDataAttribute(element, id, 'height');
  const hasPosition = hasDatasetKey(element, 'position');
  const hasRotation = hasDatasetKey(element, 'rotation');
  const tileSideAttributes = TILE_SIDE_ATTRIBUTES.filter(({ datasetKey }) =>
    hasDatasetKey(element, datasetKey)
  );
  const hasTileAngle = hasDatasetKey(element, 'tileAngle');
  const hasTileOffset = hasDatasetKey(element, 'tileOffset');
  const hasTileRotationOffset = hasDatasetKey(element, 'tileRotationOffset');
  const hasTileGap = hasDatasetKey(element, 'tileGap');
  const hasTileAlign = hasDatasetKey(element, 'tileAlign');
  const hasTileAlignOffset = hasDatasetKey(element, 'tileAlignOffset');
  const hasTiledLayout = tileSideAttributes.length > 0 ||
    hasTileAngle ||
    hasTileOffset ||
    hasTileRotationOffset ||
    hasTileGap ||
    hasTileAlign ||
    hasTileAlignOffset;
  const hasExplicitLayout = hasPosition || hasRotation;

  const base = {
    id,
    sectionId: extractRequiredDataAttribute(element, id, 'section'),
    width: parseValidPositiveFloat(widthStr, id, 'width'),
    height: parseValidPositiveFloat(heightStr, id, 'height'),
    element,
    isCenter: element.hasAttribute('data-zoom-center'),
  };

  if (hasTiledLayout && hasExplicitLayout) {
    throw new Error(
      `Zoom plane "${id}": cannot mix data-position/data-rotation with data-tile-from-* layout attributes`
    );
  }

  if (hasTiledLayout) {
    if (tileSideAttributes.length !== 1) {
      throw new Error(
        `Zoom plane "${id}": expected exactly one data-tile-from-* attribute, got ${tileSideAttributes.length}`
      );
    }

    const tileSide = tileSideAttributes[0];
    const refId = element.dataset[tileSide.datasetKey];
    if (!refId) {
      throw new ReferenceError(`Zoom plane "${id}": missing ${tileSide.attribute} reference`);
    }

    const angleStr = extractRequiredDataAttribute(element, id, 'tileAngle');
    const offset = hasTileOffset
      ? parseToTwoTuple(extractRequiredDataAttribute(element, id, 'tileOffset'), id, 'tileOffset')
      : [0, 0] as [number, number];
    const rotationOffset = hasTileRotationOffset
      ? parseToThreeTuple(
        extractRequiredDataAttribute(element, id, 'tileRotationOffset'),
        id,
        'tileRotationOffset',
        degreesToRadians
      )
      : [0, 0, 0] as [number, number, number];
    const gap = hasTileGap
      ? parseFiniteDataAttribute(extractRequiredDataAttribute(element, id, 'tileGap'), id, 'tileGap')
      : 0;
    const align = hasTileAlign
      ? parseTileAlign(extractRequiredDataAttribute(element, id, 'tileAlign'), id)
      : 'center';
    const alignOffset = hasTileAlignOffset
      ? parseFiniteDataAttribute(
        extractRequiredDataAttribute(element, id, 'tileAlignOffset'),
        id,
        'tileAlignOffset'
      )
      : 0;

    return {
      ...base,
      layout: {
        layout: 'tiled',
        side: tileSide.side,
        refId,
        angle: degreesToRadians(parseStrictFiniteNumber(angleStr)),
        offset,
        rotationOffset,
        gap,
        align,
        alignOffset,
      },
    };
  }

  if (!hasPosition || !hasRotation) {
    throw new ReferenceError(
      `Zoom plane "${id}": explicit layout requires data-position and data-rotation attributes`
    );
  }

  const positionStr: string = extractRequiredDataAttribute(element, id, 'position');
  const rotationStr: string = extractRequiredDataAttribute(element, id, 'rotation');

  return {
    ...base,
    layout: {
      layout: 'explicit',
      position: parseToThreeTuple(positionStr, id, 'position'),
      rotation: parseToThreeTuple(rotationStr, id, 'rotation', degreesToRadians),
    },
  };
}

function definitionToConfig(
  definition: PlaneDefinition,
  position: [number, number, number],
  rotation: [number, number, number]
): ZoomPlaneConfig {
  return {
    id: definition.id,
    sectionId: definition.sectionId,
    width: definition.width,
    height: definition.height,
    position,
    rotation,
    element: definition.element,
    isCenter: definition.isCenter,
  };
}

function calculateErgonomicTileOffset(
  layout: TiledPlaneDefinition,
  definition: PlaneDefinition,
  reference: ZoomPlaneConfig,
  scale: number
): [number, number] {
  let gapX = 0;
  let gapY = 0;
  let alignX = 0;
  let alignY = 0;

  if (layout.side === 'right' || layout.side === 'left') {
    if (layout.align !== 'top' && layout.align !== 'center' && layout.align !== 'bottom') {
      throw new Error(
        `Zoom plane "${definition.id}": data-tile-align="${layout.align}" is invalid for ${layout.side} tiling`
      );
    }

    gapX = layout.side === 'right' ? layout.gap : -layout.gap;

    const heightDelta = (reference.height - definition.height) * scale;
    if (layout.align === 'top') {
      alignY = heightDelta / 2;
    } else if (layout.align === 'bottom') {
      alignY = -heightDelta / 2;
    }
    alignY += layout.alignOffset;
  } else {
    if (layout.align !== 'left' && layout.align !== 'center' && layout.align !== 'right') {
      throw new Error(
        `Zoom plane "${definition.id}": data-tile-align="${layout.align}" is invalid for ${layout.side} tiling`
      );
    }

    gapY = layout.side === 'top' ? layout.gap : -layout.gap;

    const widthDelta = (reference.width - definition.width) * scale;
    if (layout.align === 'left') {
      alignX = -widthDelta / 2;
    } else if (layout.align === 'right') {
      alignX = widthDelta / 2;
    }
    alignX += layout.alignOffset;
  }

  return [
    gapX + alignX + layout.offset[0],
    gapY + alignY + layout.offset[1],
  ];
}

function resolveTiledPlane(
  definition: PlaneDefinition,
  reference: ZoomPlaneConfig,
  scale: number
): ZoomPlaneConfig {
  const layout = definition.layout;
  if (layout.layout !== 'tiled') {
    throw new Error(`Zoom plane "${definition.id}": expected tiled layout`);
  }

  const referenceCenter = new THREE.Vector3(
    reference.position[0],
    reference.position[1],
    reference.position[2]
  );
  const referenceQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(reference.rotation[0], reference.rotation[1], reference.rotation[2], 'XYZ')
  );
  const referenceRight = new THREE.Vector3(1, 0, 0).applyQuaternion(referenceQuaternion);
  const referenceUp = new THREE.Vector3(0, 1, 0).applyQuaternion(referenceQuaternion);
  const finalOffset = calculateErgonomicTileOffset(layout, definition, reference, scale);
  const hingeOffset = referenceRight.clone()
    .multiplyScalar(finalOffset[0])
    .add(referenceUp.clone().multiplyScalar(finalOffset[1]));

  let relativeQuaternion: THREE.Quaternion;
  let hinge: THREE.Vector3;
  let center: THREE.Vector3;

  // The hinge is the shared edge center. The final center is offset from that
  // hinge by half of the tiled plane's scaled size along its own rotated axis.
  if (layout.side === 'right') {
    hinge = referenceCenter.clone().add(referenceRight.clone().multiplyScalar(reference.width * scale / 2));
    relativeQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -layout.angle
    );
  } else if (layout.side === 'left') {
    hinge = referenceCenter.clone().add(referenceRight.clone().multiplyScalar(-reference.width * scale / 2));
    relativeQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      layout.angle
    );
  } else if (layout.side === 'top') {
    hinge = referenceCenter.clone().add(referenceUp.clone().multiplyScalar(reference.height * scale / 2));
    relativeQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      layout.angle
    );
  } else {
    hinge = referenceCenter.clone().add(referenceUp.clone().multiplyScalar(-reference.height * scale / 2));
    relativeQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -layout.angle
    );
  }

  hinge.add(hingeOffset);

  const offsetQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      layout.rotationOffset[0],
      layout.rotationOffset[1],
      layout.rotationOffset[2],
      'XYZ'
    )
  );
  const quaternion = referenceQuaternion.clone()
    .multiply(offsetQuaternion)
    .multiply(relativeQuaternion);
  const newRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const newUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);

  if (layout.side === 'right') {
    center = hinge.add(newRight.multiplyScalar(definition.width * scale / 2));
  } else if (layout.side === 'left') {
    center = hinge.add(newRight.multiplyScalar(-definition.width * scale / 2));
  } else if (layout.side === 'top') {
    center = hinge.add(newUp.multiplyScalar(definition.height * scale / 2));
  } else {
    center = hinge.add(newUp.multiplyScalar(-definition.height * scale / 2));
  }

  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');

  return definitionToConfig(
    definition,
    [center.x, center.y, center.z],
    [euler.x, euler.y, euler.z]
  );
}

function resolvePlaneDefinitions(
  definitions: PlaneDefinition[],
  scale: number
): ZoomPlaneConfig[] {
  const byId = new Map<string, PlaneDefinition>();
  const resolved = new Map<string, ZoomPlaneConfig>();
  const resolving = new Set<string>();

  for (const definition of definitions) {
    byId.set(definition.id, definition);
  }

  const resolve = (id: string): ZoomPlaneConfig => {
    const cached = resolved.get(id);
    if (cached) {
      return cached;
    }

    const definition = byId.get(id);
    if (!definition) {
      throw new ReferenceError(`Zoom plane "${id}" not found`);
    }

    if (resolving.has(id)) {
      throw new Error(`Zoom plane "${id}": circular tiled layout reference detected`);
    }

    resolving.add(id);

    let config: ZoomPlaneConfig;
    if (definition.layout.layout === 'explicit') {
      config = definitionToConfig(
        definition,
        definition.layout.position,
        definition.layout.rotation
      );
    } else {
      if (definition.layout.refId === definition.id) {
        throw new Error(`Zoom plane "${definition.id}": cannot tile from itself`);
      }

      const referenceDefinition = byId.get(definition.layout.refId);
      if (!referenceDefinition) {
        throw new ReferenceError(
          `Zoom plane "${definition.id}": tiled reference "${definition.layout.refId}" was not found`
        );
      }

      const reference = resolve(referenceDefinition.id);
      config = resolveTiledPlane(definition, reference, scale);
    }

    resolving.delete(id);
    resolved.set(id, config);
    return config;
  };

  return definitions.map(definition => resolve(definition.id));
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
  selectorOrOptions: string | ParseAllZoomPlanesOptions = '[data-zoom-plane]',
  scaleOverride?: number
): ZoomPlaneConfig[] {
  const selector = typeof selectorOrOptions === 'string'
    ? selectorOrOptions
    : selectorOrOptions.selector ?? '[data-zoom-plane]';
  const scale = typeof selectorOrOptions === 'string'
    ? scaleOverride ?? 1
    : selectorOrOptions.scale ?? 1;
  const elements = container.querySelectorAll<HTMLElement>(selector);
  const definitions: PlaneDefinition[] = [];
  const seenIds = new Set<string>();
  let centerPlaneId: string | null = null;

  elements.forEach((element, index) => {
    try {
      const definition = parsePlaneDefinition(element);

      if (seenIds.has(definition.id)) {
        throw new Error(`Duplicate zoom plane ID: "${definition.id}"`);
      }
      seenIds.add(definition.id);

      if (definition.isCenter) {
        if (centerPlaneId !== null) {
          throw new Error(
            `Multiple center zoom planes found: "${centerPlaneId}" and "${definition.id}". ` +
            `Only one zoom plane can have the data-zoom-center attribute.`
          );
        }
        centerPlaneId = definition.id;
      }

      definitions.push(definition);
    } catch (e) {
      console.error(`Failed to parse zoom plane at index ${index}:`, e);
      throw e;
    }
  });

  return resolvePlaneDefinitions(definitions, scale);
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
