import type { RenderBackend, RenderTypes } from './render-contract';
import type { CameraState } from './types';
import { easeInOutCubic, easeOutCubic } from './easing';

const DEG2RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// Helpers
// =============================================================================

/** Interpolate up vector and FOV */
function lerpUpAndFov<T extends RenderTypes>(
  backend: RenderBackend<T>,
  from: CameraState<T>,
  to: CameraState<T>,
  t: number,
): { up: T['Vector3']; fov: number } {
  const up = backend.createVector3().lerpVectors(from.up, to.up, t).normalize();
  const fov = from.fov + (to.fov - from.fov) * t;
  return { up, fov };
}

/** Standard smoothstep (Hermite interpolation) between two edges */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
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
export function applyTransition<T extends RenderTypes>(
  backend: RenderBackend<T>,
  from: CameraState<T>,
  to: CameraState<T>,
  rawT: number,
  camera: T['PerspectiveCamera'],
): void {
  const state = calculateTransitionState(backend, from, to, rawT);
  camera.position.copy(state.position);
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
  camera.up.copy(state.up);
  camera.lookAt(state.target);
}

/**
 * Calculate the complete camera state for a transition progress value.
 * Callers that track camera targets explicitly should apply this state through
 * their camera controller instead of mutating the camera directly.
 */
export function calculateTransitionState<T extends RenderTypes>(
  backend: RenderBackend<T>,
  from: CameraState<T>,
  to: CameraState<T>,
  rawT: number,
): CameraState<T> {
  // Forward angle
  const fromFwd = backend.createVector3().subVectors(from.target, from.position).normalize();
  const toFwd = backend.createVector3().subVectors(to.target, to.position).normalize();
  const fwdDot = clamp(fromFwd.dot(toFwd), -1, 1);
  const fwdAngle = Math.acos(fwdDot);

  // Up angle (captures roll/tilt that forward angle misses)
  const upDot = clamp(from.up.dot(to.up), -1, 1);
  const upAngle = Math.acos(upDot);

  // Total reorientation
  const totalAngle = fwdAngle + upAngle;

  // Blend: 0 (Early Look) at ≤30°, 1 (Orbit) at ≥35°
  const lowerAngle = 30 * DEG2RAD;
  const upperAngle = 35 * DEG2RAD;
  const blend = smoothstep(lowerAngle, upperAngle, totalAngle);

  if (blend < 0.5) {
    return calculateEarlyLookState(backend, from, to, rawT);
  } else {
    return calculateOrbitState(backend, from, to, rawT);
  }
}

/**
 * EARLY LOOK: The look-at target arrives before the position does.
 * The camera starts facing the destination at ~70% of the animation
 * while still sliding into its final position. This makes the rotation
 * feel concurrent with the translation rather than sequential.
 */
function calculateEarlyLookState<T extends RenderTypes>(
  backend: RenderBackend<T>,
  from: CameraState<T>,
  to: CameraState<T>,
  rawT: number,
): CameraState<T> {
  const posT = easeInOutCubic(rawT);

  // Target uses a faster curve — arrives at ~70% of the animation
  const targetRaw = Math.min(rawT / 0.7, 1.0);
  const targetT = easeOutCubic(targetRaw);

  const position = backend.createVector3().lerpVectors(from.position, to.position, posT);
  const target = backend.createVector3().lerpVectors(from.target, to.target, targetT);
  const { up, fov } = lerpUpAndFov(backend, from, to, posT);

  return { position, target, up, fov };
}

/**
 * ORBIT: Camera position follows a spherical arc around the midpoint
 * of the two targets, maintaining roughly constant distance while
 * sweeping around. Creates an orbital/turntable feel.
 */
function calculateOrbitState<T extends RenderTypes>(
  backend: RenderBackend<T>,
  from: CameraState<T>,
  to: CameraState<T>,
  rawT: number,
): CameraState<T> {
  const t = easeInOutCubic(rawT);

  // Linearly interpolate the look-at target
  const target = backend.createVector3().lerpVectors(from.target, to.target, t);

  // For position: slerp around the midpoint of the two targets
  const midTarget = backend.createVector3().lerpVectors(from.target, to.target, 0.5);
  const fromOffset = backend.createVector3().subVectors(from.position, midTarget);
  const toOffset = backend.createVector3().subVectors(to.position, midTarget);

  // Interpolate radius
  const fromLen = fromOffset.length();
  const toLen = toOffset.length();
  const currentLen = fromLen + (toLen - fromLen) * t;

  // Slerp direction
  const fromDir = fromOffset.clone().normalize();
  const toDir = toOffset.clone().normalize();
  const dot = clamp(fromDir.dot(toDir), -1, 1);
  const theta = Math.acos(dot);

  let position: T['Vector3'];
  if (theta < 0.001) {
    // Nearly parallel — fall back to lerp
    position = backend.createVector3().lerpVectors(from.position, to.position, t);
  } else {
    const sinTheta = Math.sin(theta);
    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;
    const slerpedDir = backend.createVector3()
      .addScaledVector(fromDir, a)
      .addScaledVector(toDir, b)
      .normalize();
    position = midTarget.clone().add(slerpedDir.multiplyScalar(currentLen));
  }

  const { up, fov } = lerpUpAndFov(backend, from, to, t);
  return { position, target, up, fov };
}
