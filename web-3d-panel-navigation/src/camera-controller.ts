import type { RenderBackend, RenderTypes } from './render-contract';
import type { ZoomPlaneConfig, CameraState, NavigationConfig } from './types';

/**
 * CameraController - Camera state calculation and application.
 *
 * Generic over the active backend's `RenderTypes` so the camera reference and
 * any constructed `Vector3`/`Euler` instances are typed against the backend's
 * concrete classes. The backend is injected so this class can construct
 * vectors/eulers via factories rather than calling `new` on a backend-specific
 * class.
 *
 * Responsibilities:
 * - Calculate perpendicular camera position for any arbitrarily-rotated plane
 * - Apply camera states (instant or interpolated)
 * - Store the current look-at target explicitly (no magic number derivation)
 *
 * Does NOT own: animation loops (the timeline drives interpolation externally)
 */
export class CameraController<T extends RenderTypes = RenderTypes> {
  private camera: T['PerspectiveCamera'];
  private overviewState: CameraState<T>;
  private config: NavigationConfig;
  private backend: RenderBackend<T>;

  /** Explicitly stored target — avoids the getWorldDirection * 100 hack */
  private currentTarget: T['Vector3'];

  constructor(
    camera: T['PerspectiveCamera'],
    overviewState: CameraState<T>,
    config: NavigationConfig,
    backend: RenderBackend<T>
  ) {
    this.camera = camera;
    this.overviewState = overviewState;
    this.config = config;
    this.backend = backend;
    this.currentTarget = overviewState.target.clone();
  }

  /**
   * Calculate the camera state needed to view a zoom plane perpendicularly,
   * with the plane centered on screen and filling the target percentage of the
   * viewport on whichever axis is the binding constraint.
   *
   * The distance is derived from both the plane's height and width so the
   * panel always fits inside a `fillPercentage`-of-viewport box regardless of
   * viewport aspect ratio. Mirrors the dual-axis math used by
   * `calculateOverviewCameraDistance` in overview-camera.ts.
   */
  calculatePerpendicularState(
    plane: ZoomPlaneConfig,
    scale: number,
    viewportAspect: number
  ): CameraState<T> {
    const actualWidth = plane.width * scale;
    const actualHeight = plane.height * scale;
    const targetFov = this.config.detailFov;
    const fovRadians = (targetFov * Math.PI) / 180;
    const halfFovTan = Math.tan(fovRadians / 2);
    const fill = this.config.fillPercentage;

    const distanceForHeight = (actualHeight / 2) / (halfFovTan * fill);
    const distanceForWidth = (actualWidth / 2) / (halfFovTan * fill * viewportAspect);
    const distance = Math.max(distanceForHeight, distanceForWidth);

    const euler = this.backend.createEuler(
      plane.rotation[0],
      plane.rotation[1],
      plane.rotation[2],
    );

    // Plane's normal vector (perpendicular, pointing toward viewer)
    const normal = this.backend.createVector3(0, 0, 1);
    normal.applyEuler(euler);
    normal.normalize();

    // Plane's local "up" vector — aligns with screen vertical when viewing head-on
    const planeUp = this.backend.createVector3(0, 1, 0);
    planeUp.applyEuler(euler);
    planeUp.normalize();

    const planeCenter = this.backend.createVector3(
      plane.position[0],
      plane.position[1],
      plane.position[2]
    );

    // Camera position: plane center + (normal * distance)
    const cameraPosition = planeCenter.clone()
      .add(normal.clone().multiplyScalar(distance));

    return {
      position: cameraPosition,
      target: planeCenter.clone(),
      up: planeUp,
      fov: targetFov,
    };
  }

  /**
   * Instantly set the camera to a specific state.
   * Stores the target explicitly for accurate retrieval.
   */
  setToState(state: CameraState<T>): void {
    this.camera.position.copy(state.position);
    this.camera.up.copy(state.up);
    this.camera.fov = state.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(state.target);
    this.currentTarget = state.target.clone();
  }

  /**
   * Update the stored overview state (e.g., after resize recalculation).
   */
  setOverviewState(state: CameraState<T>): void {
    this.overviewState = state;
  }

  /**
   * Get the overview camera state (cloned to prevent mutation).
   */
  getOverviewState(): CameraState<T> {
    return {
      position: this.overviewState.position.clone(),
      target: this.overviewState.target.clone(),
      up: this.overviewState.up.clone(),
      fov: this.overviewState.fov,
    };
  }

  /**
   * Get the current camera state using the explicitly stored target.
   */
  getCurrentState(): CameraState<T> {
    return {
      position: this.camera.position.clone(),
      target: this.currentTarget.clone(),
      up: this.camera.up.clone(),
      fov: this.camera.fov,
    };
  }
}
