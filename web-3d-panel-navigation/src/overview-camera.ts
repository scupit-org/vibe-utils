import type { RenderBackend, RenderTypes } from './render-contract';
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
 * @param backend - Active render backend (used to construct Vector3/Euler)
 * @param configs - All zoom plane configurations
 * @param scale - Scale factor applied to planes
 * @param fov - Camera field of view in degrees
 * @param aspectRatio - Viewport width / height
 * @param padding - Extra padding as fraction (e.g., 0.15 = 15%)
 * @returns CameraState for the overview position
 */
export function calculateOverviewState<T extends RenderTypes>(
  backend: RenderBackend<T>,
  configs: ZoomPlaneConfig[],
  scale: number,
  fov: number,
  aspectRatio: number,
  padding: number = 0.15,
): CameraState<T> {
  if (configs.length === 0) {
    return {
      position: backend.createVector3(0, 0, 1200),
      target: backend.createVector3(0, 0, 0),
      up: backend.createVector3(0, 1, 0),
      fov,
    };
  }

  const boundingBox = calculateAllPlanesBoundingBox(backend, configs, scale);
  const centerPlane = findCenterZoomPlane(configs);

  if (centerPlane) {
    return calculateFocalElementMode(backend, centerPlane, boundingBox, fov, aspectRatio, padding);
  } else {
    return calculateBalancedSceneMode(backend, boundingBox, fov, aspectRatio, padding);
  }
}

/**
 * Focal Element Mode: camera perpendicular to the center plane,
 * pulled back far enough to keep all planes in frame.
 */
function calculateFocalElementMode<T extends RenderTypes>(
  backend: RenderBackend<T>,
  centerPlane: ZoomPlaneConfig,
  boundingBox: BoundingBox,
  fov: number,
  aspectRatio: number,
  padding: number,
): CameraState<T> {
  const centerPosition = backend.createVector3(
    centerPlane.position[0],
    centerPlane.position[1],
    centerPlane.position[2]
  );

  // Calculate the center plane's normal vector (perpendicular to surface)
  const normal = backend.createVector3(0, 0, 1);
  const euler = backend.createEuler(
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

  // Position camera along the center plane's normal at the required distance.
  // `centerPosition.clone()` is essential — without the clone, `.add(...)` would
  // mutate centerPosition itself, which we still want untouched for the `target`
  // field below.
  const cameraPosition = centerPosition.clone().add(
    normal.clone().multiplyScalar(requiredDistance)
  );

  // Aliasing note: `target` and the local `centerPosition` are the SAME object
  // reference. Mutating one mutates the other. This is safe today because
  // CameraController.setToState clones state.target into its own internal
  // currentTarget defensively, so callers never see the aliasing. If a future
  // consumer mutates the returned state's target in place expecting it to be
  // independent of centerPlane.position-derived state, clone it here.
  return {
    position: cameraPosition,
    target: centerPosition,
    up: backend.createVector3(0, 1, 0),
    fov,
  };
}

/**
 * Balanced Scene Mode: camera centered on the geometric center of all planes.
 */
function calculateBalancedSceneMode<T extends RenderTypes>(
  backend: RenderBackend<T>,
  boundingBox: BoundingBox,
  fov: number,
  aspectRatio: number,
  padding: number,
): CameraState<T> {
  const cameraZ = calculateOverviewCameraDistance(boundingBox, fov, aspectRatio, padding);

  const centerX = (boundingBox.minX + boundingBox.maxX) / 2;
  const centerY = (boundingBox.minY + boundingBox.maxY) / 2;
  const centerZ = (boundingBox.minZ + boundingBox.maxZ) / 2;

  return {
    position: backend.createVector3(centerX, centerY, cameraZ),
    target: backend.createVector3(centerX, centerY, centerZ),
    up: backend.createVector3(0, 1, 0),
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
