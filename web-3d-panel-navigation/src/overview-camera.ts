import { Vector3, Euler } from 'three';
import type { ZoomPlaneConfig, CameraState } from './types';
import { calculateAllPlanesBoundingBox, type BoundingBox } from './projection';
import { findCenterZoomPlane } from './zoom-plane-parser';

/**
 * Calculate the overview camera state to fit all zoom planes in the viewport.
 *
 * Two strategies:
 * - Focal Element Mode: when a plane has data-zoom-center, camera aligns
 *   perpendicular to it with it dead-center in viewport
 * - Balanced Scene Mode: camera centers on the geometric center of all planes
 *
 * @param configs - All zoom plane configurations
 * @param scale - Scale factor applied to planes
 * @param fov - Camera field of view in degrees
 * @param aspectRatio - Viewport width / height
 * @param padding - Extra padding as fraction (e.g., 0.15 = 15%)
 * @returns CameraState for the overview position
 */
export function calculateOverviewState(
  configs: ZoomPlaneConfig[],
  scale: number,
  fov: number,
  aspectRatio: number,
  padding: number = 0.15
): CameraState {
  if (configs.length === 0) {
    return {
      position: new Vector3(0, 0, 1200),
      target: new Vector3(0, 0, 0),
      up: new Vector3(0, 1, 0),
      fov,
    };
  }

  const boundingBox = calculateAllPlanesBoundingBox(configs, scale);
  const centerPlane = findCenterZoomPlane(configs);

  if (centerPlane) {
    return calculateFocalElementMode(centerPlane, boundingBox, fov, aspectRatio, padding);
  } else {
    return calculateBalancedSceneMode(boundingBox, fov, aspectRatio, padding);
  }
}

/**
 * Focal Element Mode: camera perpendicular to the center plane,
 * pulled back far enough to keep all planes in frame.
 */
function calculateFocalElementMode(
  centerPlane: ZoomPlaneConfig,
  boundingBox: BoundingBox,
  fov: number,
  aspectRatio: number,
  padding: number
): CameraState {
  const centerPosition = new Vector3(
    centerPlane.position[0],
    centerPlane.position[1],
    centerPlane.position[2]
  );

  // Calculate the center plane's normal vector (perpendicular to surface)
  const normal = new Vector3(0, 0, 1);
  const euler = new Euler(
    centerPlane.rotation[0],
    centerPlane.rotation[1],
    centerPlane.rotation[2]
  );
  normal.applyEuler(euler);
  normal.normalize();

  // Calculate the minimum distance needed to fit all planes
  const fovRadians = (fov * Math.PI) / 180;
  const halfFovTan = Math.tan(fovRadians / 2);

  const boxWidth = boundingBox.maxX - boundingBox.minX;
  const boxHeight = boundingBox.maxY - boundingBox.minY;

  const paddedWidth = boxWidth * (1 + padding);
  const paddedHeight = boxHeight * (1 + padding);

  const distanceForHeight = (paddedHeight / 2) / halfFovTan;
  const distanceForWidth = (paddedWidth / 2) / (halfFovTan * aspectRatio);

  let requiredDistance = Math.max(distanceForHeight, distanceForWidth);

  // Account for planes that extend behind the center plane
  const maxDepthBehindCenter = Math.max(
    0,
    boundingBox.maxZ - centerPlane.position[2]
  );
  requiredDistance += maxDepthBehindCenter;

  // Position camera along the center plane's normal at the required distance
  const cameraPosition = centerPosition.clone().add(
    normal.clone().multiplyScalar(requiredDistance)
  );

  return {
    position: cameraPosition,
    target: centerPosition,
    up: new Vector3(0, 1, 0),
    fov,
  };
}

/**
 * Balanced Scene Mode: camera centered on the geometric center of all planes.
 */
function calculateBalancedSceneMode(
  boundingBox: BoundingBox,
  fov: number,
  aspectRatio: number,
  padding: number
): CameraState {
  const cameraZ = calculateOverviewCameraDistance(boundingBox, fov, aspectRatio, padding);

  const centerX = (boundingBox.minX + boundingBox.maxX) / 2;
  const centerY = (boundingBox.minY + boundingBox.maxY) / 2;
  const centerZ = (boundingBox.minZ + boundingBox.maxZ) / 2;

  return {
    position: new Vector3(centerX, centerY, cameraZ),
    target: new Vector3(centerX, centerY, centerZ),
    up: new Vector3(0, 1, 0),
    fov,
  };
}

/**
 * Calculate the camera Z position needed to fit all zoom planes in the viewport.
 */
export function calculateOverviewCameraDistance(
  boundingBox: BoundingBox,
  fov: number,
  aspectRatio: number,
  padding: number = 0.15
): number {
  const fovRadians = (fov * Math.PI) / 180;
  const halfFovTan = Math.tan(fovRadians / 2);

  const boxWidth = boundingBox.maxX - boundingBox.minX;
  const boxHeight = boundingBox.maxY - boundingBox.minY;

  const paddedWidth = boxWidth * (1 + padding);
  const paddedHeight = boxHeight * (1 + padding);

  const distanceForHeight = (paddedHeight / 2) / halfFovTan;
  const distanceForWidth = (paddedWidth / 2) / (halfFovTan * aspectRatio);

  const requiredDistance = Math.max(distanceForHeight, distanceForWidth);

  return requiredDistance + boundingBox.maxZ;
}
