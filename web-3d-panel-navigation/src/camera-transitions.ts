import * as THREE from 'three';
import type { CameraState } from './types';
import { easeInOutCubic, easeOutCubic } from './easing';

// =============================================================================
// Helpers
// =============================================================================

/** Apply position, target, up, and FOV to camera */
function applyToCamera(
  camera: THREE.PerspectiveCamera,
  position: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
  fov: number
): void {
  camera.position.copy(position);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.up.copy(up);
  camera.lookAt(target);
}

/** Interpolate up vector and FOV */
function lerpUpAndFov(
  from: CameraState,
  to: CameraState,
  t: number
): { up: THREE.Vector3; fov: number } {
  const up = new THREE.Vector3().lerpVectors(from.up, to.up, t).normalize();
  const fov = from.fov + (to.fov - from.fov) * t;
  return { up, fov };
}

/** Standard smoothstep (Hermite interpolation) between two edges */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// =============================================================================
// Transition Implementations
// =============================================================================

/**
 * ADAPTIVE: Continuously adapts transition behavior based on the total
 * reorientation needed (forward angle + up/roll angle).
 *
 * Total reorientation ≤30°: Early Look — target leads, straight path
 * Total reorientation ≥35°: Orbit — matched timing, curved arc
 * In between: Smooth blend via smoothstep
 *
 * Using forward + up angle captures the full camera reorientation,
 * including roll/tilt that forward angle alone misses.
 */
export function applyTransition(
  from: CameraState, to: CameraState,
  rawT: number, camera: THREE.PerspectiveCamera
): void {
  // Forward angle
  const fromFwd = new THREE.Vector3().subVectors(from.target, from.position).normalize();
  const toFwd = new THREE.Vector3().subVectors(to.target, to.position).normalize();
  const fwdDot = THREE.MathUtils.clamp(fromFwd.dot(toFwd), -1, 1);
  const fwdAngle = Math.acos(fwdDot);

  // Up angle (captures roll/tilt that forward angle misses)
  const upDot = THREE.MathUtils.clamp(from.up.dot(to.up), -1, 1);
  const upAngle = Math.acos(upDot);

  // Total reorientation
  const totalAngle = fwdAngle + upAngle;

  // Blend: 0 (Early Look) at ≤30°, 1 (Orbit) at ≥35°
  const lowerAngle = 30 * THREE.MathUtils.DEG2RAD;
  const upperAngle = 35 * THREE.MathUtils.DEG2RAD;
  const blend = smoothstep(lowerAngle, upperAngle, totalAngle);

  if (blend < 0.5) {
    // Early Look regime: target leads position, straight path
    transitionEarlyLook(from, to, rawT, camera);
  } else {
    // Orbit regime: matched timing, sweeping arc
    transitionOrbit(from, to, rawT, camera);
  }
}

/**
 * EARLY LOOK: The look-at target arrives before the position does.
 * The camera starts facing the destination at ~70% of the animation
 * while still sliding into its final position. This makes the rotation
 * feel concurrent with the translation rather than sequential.
 */
function transitionEarlyLook(
  from: CameraState, to: CameraState,
  rawT: number, camera: THREE.PerspectiveCamera
): void {
  const posT = easeInOutCubic(rawT);

  // Target uses a faster curve — arrives at ~70% of the animation
  const targetRaw = Math.min(rawT / 0.7, 1.0);
  const targetT = easeOutCubic(targetRaw);

  const position = new THREE.Vector3().lerpVectors(from.position, to.position, posT);
  const target = new THREE.Vector3().lerpVectors(from.target, to.target, targetT);
  const { up, fov } = lerpUpAndFov(from, to, posT);
  applyToCamera(camera, position, target, up, fov);
}

/**
 * ORBIT: Camera position follows a spherical arc around the midpoint
 * of the two targets, maintaining roughly constant distance while
 * sweeping around. Creates an orbital/turntable feel.
 */
function transitionOrbit(
  from: CameraState, to: CameraState,
  rawT: number, camera: THREE.PerspectiveCamera
): void {
  const t = easeInOutCubic(rawT);

  // Linearly interpolate the look-at target
  const target = new THREE.Vector3().lerpVectors(from.target, to.target, t);

  // For position: slerp around the midpoint of the two targets
  const midTarget = new THREE.Vector3().lerpVectors(from.target, to.target, 0.5);
  const fromOffset = new THREE.Vector3().subVectors(from.position, midTarget);
  const toOffset = new THREE.Vector3().subVectors(to.position, midTarget);

  // Interpolate radius
  const fromLen = fromOffset.length();
  const toLen = toOffset.length();
  const currentLen = fromLen + (toLen - fromLen) * t;

  // Slerp direction
  const fromDir = fromOffset.clone().normalize();
  const toDir = toOffset.clone().normalize();
  const dot = THREE.MathUtils.clamp(fromDir.dot(toDir), -1, 1);
  const theta = Math.acos(dot);

  let position: THREE.Vector3;
  if (theta < 0.001) {
    // Nearly parallel — fall back to lerp
    position = new THREE.Vector3().lerpVectors(from.position, to.position, t);
  } else {
    const sinTheta = Math.sin(theta);
    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;
    const slerpedDir = new THREE.Vector3()
      .addScaledVector(fromDir, a)
      .addScaledVector(toDir, b)
      .normalize();
    position = midTarget.clone().add(slerpedDir.multiplyScalar(currentLen));
  }

  const { up, fov } = lerpUpAndFov(from, to, t);
  applyToCamera(camera, position, target, up, fov);
}
