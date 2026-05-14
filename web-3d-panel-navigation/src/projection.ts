import { Vector3, Camera, Euler, PerspectiveCamera } from 'three';
import type { ScreenRect, ZoomPlaneConfig } from './types';

/**
 * Bounding box in world space
 */
export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Calculate the world-space bounding box that contains all zoom planes.
 *
 * @param configs - Array of zoom plane configurations
 * @param scale - Scale factor applied to planes
 * @returns Bounding box containing all plane corners
 */
export function calculateAllPlanesBoundingBox(
  configs: ZoomPlaneConfig[],
  scale: number
): BoundingBox {
  if (configs.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const config of configs) {
    const corners = getPlaneWorldCorners(config, scale);
    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
      minZ = Math.min(minZ, corner.z);
      maxZ = Math.max(maxZ, corner.z);
    }
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Project a 3D point to 2D screen coordinates.
 *
 * @param point - The point in world space
 * @param camera - The camera to project through
 * @param viewportWidth - Viewport width in pixels
 * @param viewportHeight - Viewport height in pixels
 * @returns Screen coordinates {x, y} in pixels from top-left
 */
export function projectToScreen(
  point: Vector3,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const projected = point.clone();
  projected.project(camera);

  // NDC x: -1 = left edge, +1 = right edge
  // NDC y: -1 = bottom edge, +1 = top edge
  // Screen: (0,0) = top-left, positive Y goes down
  const x = (projected.x + 1) / 2 * viewportWidth;
  const y = (1 - projected.y) / 2 * viewportHeight;

  return { x, y };
}

/**
 * Calculate the four corners of a zoom plane in world space.
 *
 * @param config - Zoom plane configuration
 * @param scale - Scale factor applied to the plane
 * @returns Array of four Vector3 corners [topLeft, topRight, bottomRight, bottomLeft]
 */
export function getPlaneWorldCorners(
  config: ZoomPlaneConfig,
  scale: number
): Vector3[] {
  const width = config.width * scale;
  const height = config.height * scale;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Local space corners (before rotation)
  // Plane is assumed to be in XY plane, facing +Z
  const localCorners = [
    new Vector3(-halfWidth, halfHeight, 0),   // top-left
    new Vector3(halfWidth, halfHeight, 0),    // top-right
    new Vector3(halfWidth, -halfHeight, 0),   // bottom-right
    new Vector3(-halfWidth, -halfHeight, 0),  // bottom-left
  ];

  const euler = new Euler(
    config.rotation[0],
    config.rotation[1],
    config.rotation[2]
  );

  const position = new Vector3(
    config.position[0],
    config.position[1],
    config.position[2]
  );

  return localCorners.map(corner => {
    const worldCorner = corner.clone();
    worldCorner.applyEuler(euler);
    worldCorner.add(position);
    return worldCorner;
  });
}

/**
 * Get the screen-space bounding rectangle of a zoom plane.
 * Returns inset values (distance from each viewport edge).
 */
export function getPlaneScreenRect(
  config: ZoomPlaneConfig,
  scale: number,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): ScreenRect {
  const worldCorners = getPlaneWorldCorners(config, scale);
  const screenCorners = worldCorners.map(corner =>
    projectToScreen(corner, camera, viewportWidth, viewportHeight)
  );

  const xs = screenCorners.map(c => c.x);
  const ys = screenCorners.map(c => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    top: Math.max(0, minY),
    right: Math.max(0, viewportWidth - maxX),
    bottom: Math.max(0, viewportHeight - maxY),
    left: Math.max(0, minX)
  };
}

/**
 * Calculate the screen rect for a plane that is centered and viewed perpendicularly.
 * Simplified calculation since the plane is axis-aligned on screen.
 */
export function getCenteredPlaneRect(
  config: ZoomPlaneConfig,
  scale: number,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number
): ScreenRect {
  const actualWidth = config.width * scale;
  const actualHeight = config.height * scale;

  const planeCenter = new Vector3(
    config.position[0],
    config.position[1],
    config.position[2]
  );
  const distance = camera.position.distanceTo(planeCenter);

  const fovRadians = (camera.fov * Math.PI) / 180;
  const viewportHeightAtPlane = 2 * distance * Math.tan(fovRadians / 2);
  const viewportWidthAtPlane = viewportHeightAtPlane * (viewportWidth / viewportHeight);

  const widthFraction = actualWidth / viewportWidthAtPlane;
  const heightFraction = actualHeight / viewportHeightAtPlane;

  const screenWidth = widthFraction * viewportWidth;
  const screenHeight = heightFraction * viewportHeight;

  const horizontalInset = (viewportWidth - screenWidth) / 2;
  const verticalInset = (viewportHeight - screenHeight) / 2;

  return {
    top: Math.max(0, verticalInset),
    right: Math.max(0, horizontalInset),
    bottom: Math.max(0, verticalInset),
    left: Math.max(0, horizontalInset)
  };
}

/**
 * Convert a ScreenRect to a CSS clip-path inset() string.
 */
export function screenRectToClipPath(
  rect: ScreenRect,
  viewportWidth: number,
  viewportHeight: number
): string {
  const topPercent = (rect.top / viewportHeight) * 100;
  const rightPercent = (rect.right / viewportWidth) * 100;
  const bottomPercent = (rect.bottom / viewportHeight) * 100;
  const leftPercent = (rect.left / viewportWidth) * 100;

  return `inset(${topPercent.toFixed(2)}% ${rightPercent.toFixed(2)}% ${bottomPercent.toFixed(2)}% ${leftPercent.toFixed(2)}%)`;
}

/**
 * Linearly interpolate between two ScreenRects.
 */
export function lerpScreenRect(
  from: ScreenRect,
  to: ScreenRect,
  t: number
): ScreenRect {
  return {
    top: from.top + (to.top - from.top) * t,
    right: from.right + (to.right - from.right) * t,
    bottom: from.bottom + (to.bottom - from.bottom) * t,
    left: from.left + (to.left - from.left) * t
  };
}

/**
 * Create a ScreenRect representing the full viewport (no clipping).
 */
export function fullViewportRect(): ScreenRect {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}
