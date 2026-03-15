/**
 * Easing functions and utilities for animation phase coordination.
 */

/**
 * Cubic ease-in-out. Smooth acceleration and deceleration.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Cubic ease-out. Quick start, smooth deceleration.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Remap a global progress value [0, 1] into a sub-range [start, end],
 * returning a local progress value clamped to [0, 1].
 *
 * This is the key utility for overlapping animation phases. Each phase
 * defines its start and end within the global timeline, and remap
 * converts the global tick into a per-phase local progress.
 *
 * @param t - Global progress (0 to 1)
 * @param start - Phase start within global timeline (0 to 1)
 * @param end - Phase end within global timeline (0 to 1)
 * @returns Local progress for this phase (0 to 1), clamped
 */
export function remap(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}
