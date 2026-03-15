import * as THREE from 'three';
import type { ZoomPlaneConfig, CameraState, NavigationConfig } from './types';

/**
 * CameraController - Camera state calculation and application.
 *
 * Responsibilities:
 * - Calculate perpendicular camera position for any arbitrarily-rotated plane
 * - Apply camera states (instant or interpolated)
 * - Store the current look-at target explicitly (no magic number derivation)
 *
 * Does NOT own: animation loops (the timeline drives interpolation externally)
 */
export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private overviewState: CameraState;
  private config: NavigationConfig;

  /** Explicitly stored target — avoids the getWorldDirection * 100 hack */
  private currentTarget: THREE.Vector3;

  constructor(
    camera: THREE.PerspectiveCamera,
    overviewState: CameraState,
    config: NavigationConfig
  ) {
    this.camera = camera;
    this.overviewState = overviewState;
    this.config = config;
    this.currentTarget = overviewState.target.clone();
  }

  /**
   * Calculate the camera state needed to view a zoom plane perpendicularly,
   * with the plane centered on screen and filling the target percentage of the viewport.
   */
  calculatePerpendicularState(
    plane: ZoomPlaneConfig,
    scale: number
  ): CameraState {
    const actualHeight = plane.height * scale;
    const targetFov = this.config.detailFov;
    const fovRadians = (targetFov * Math.PI) / 180;

    // distance = (height/2) / (tan(fov/2) * fillPercentage)
    const distance = (actualHeight / 2) / (Math.tan(fovRadians / 2) * this.config.fillPercentage);

    const euler = new THREE.Euler(plane.rotation[0], plane.rotation[1], plane.rotation[2]);

    // Plane's normal vector (perpendicular, pointing toward viewer)
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyEuler(euler);
    normal.normalize();

    // Plane's local "up" vector — aligns with screen vertical when viewing head-on
    const planeUp = new THREE.Vector3(0, 1, 0);
    planeUp.applyEuler(euler);
    planeUp.normalize();

    const planeCenter = new THREE.Vector3(
      plane.position[0],
      plane.position[1],
      plane.position[2]
    );

    // Camera position: plane center + (normal * distance)
    const cameraPosition = planeCenter.clone().add(normal.clone().multiplyScalar(distance));

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
  setToState(state: CameraState): void {
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
  setOverviewState(state: CameraState): void {
    this.overviewState = state;
  }

  /**
   * Get the overview camera state (cloned to prevent mutation).
   */
  getOverviewState(): CameraState {
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
  getCurrentState(): CameraState {
    return {
      position: this.camera.position.clone(),
      target: this.currentTarget.clone(),
      up: this.camera.up.clone(),
      fov: this.camera.fov,
    };
  }
}
