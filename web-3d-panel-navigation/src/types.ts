import type { Vector3, Object3D } from 'three';

/**
 * Configuration for a zoom plane in the 3D scene.
 * Parsed from HTML data attributes.
 */
export interface ZoomPlaneConfig {
  /** Unique identifier for the zoom plane */
  id: string;

  /** ID of the page section to reveal when zoomed in */
  sectionId: string;

  /** Width of the plane in world units (before scaling) */
  width: number;

  /** Height of the plane in world units (before scaling) */
  height: number;

  /** Position in 3D space [x, y, z] */
  position: [number, number, number];

  /** Rotation as Euler angles [x, y, z] in radians */
  rotation: [number, number, number];

  /** Reference to the DOM element */
  element: HTMLElement;

  /**
   * If true, this plane is the "focal element" that determines camera
   * alignment in overview mode. Only one plane can be marked as center.
   *
   * When a center element exists, the camera uses "Focal Element Mode":
   * - Camera aligns perpendicular to this element's surface
   * - This element appears dead-center in the viewport
   *
   * When no center element exists, the camera uses "Balanced Scene Mode":
   * - Camera centers on the geometric center of all elements
   * - All elements are evenly distributed in frame
   */
  isCenter?: boolean;
}

/**
 * Represents a camera state (position, look-at target, up vector, and field of view)
 */
export interface CameraState {
  /** Camera position in 3D space */
  position: Vector3;

  /** Point the camera is looking at */
  target: Vector3;

  /**
   * Camera's "up" direction. Controls the roll rotation.
   * When looking at a tilted plane, this should match the plane's local up
   * so that the plane appears axis-aligned on screen.
   */
  up: Vector3;

  /** Field of view in degrees */
  fov: number;
}

/**
 * Navigation state machine states
 */
export type NavigationState =
  | 'overview'        // Viewing all zoom planes
  | 'zooming-in'      // Camera moving to plane + clip expanding
  | 'section'         // Viewing page content
  | 'zooming-out';    // Clip shrinking + camera returning

/**
 * Content reveal strategy.
 *
 * transform-mask keeps the content reveal on transform/opacity updates.
 * clip-path preserves the original clip-path reveal behavior as a fallback.
 */
export type RevealMode =
  | 'transform-mask'
  | 'clip-path';

/**
 * Plane scaling strategy.
 *
 * css-transform preserves the original behavior: each CSS3D object gets a
 * Three.js scale transform. baked-layout writes the scaled dimensions into the
 * DOM element and leaves the object transform unscaled, reducing one layer of
 * transform work on large DOM/SVG panels.
 */
export type PlaneScaleMode =
  | 'css-transform'
  | 'baked-layout';

/**
 * Screen-space rectangle representing inset distances from viewport edges.
 * Used for clip-path calculations.
 */
export interface ScreenRect {
  /** Distance from top of viewport in pixels */
  top: number;
  /** Distance from right of viewport in pixels */
  right: number;
  /** Distance from bottom of viewport in pixels */
  bottom: number;
  /** Distance from left of viewport in pixels */
  left: number;
}

/**
 * Reference to a CSS3DObject and its associated DOM element
 */
export interface CSS3DObjectRef {
  /** The CSS3DObject in the Three.js scene */
  object: Object3D;
  /** The DOM element being rendered */
  element: HTMLElement;
}

/**
 * DOM element references required by the navigation system.
 * All references are injected — no hard-coded DOM lookups inside the library.
 */
export interface ContainerRefs {
  /** Container for the CSS3D scene */
  sceneContainer: HTMLElement;
  /** Container for page content sections (clip-path target) */
  contentContainer: HTMLElement;
  /** Container holding zoom plane definition elements (data-zoom-plane) */
  planesSource: HTMLElement;
  /** Optional back button element */
  backButton?: HTMLElement | null;
}

/**
 * Configuration for the navigation system
 */
export interface NavigationConfig {
  /** Scale factor applied to zoom planes (default: 0.5) */
  scale: number;

  /** Content reveal strategy (default: transform-mask) */
  revealMode: RevealMode;

  /** Plane scaling strategy (default: css-transform) */
  planeScaleMode: PlaneScaleMode;

  /** Field of view for overview camera in degrees (default: 50) */
  overviewFov: number;

  /** Field of view when viewing a plane in degrees (default: 50) */
  detailFov: number;

  /** How much of viewport height the plane should fill when zoomed, 0-1 (default: 0.8) */
  fillPercentage: number;

  /** Camera animation duration in ms (default: 1000) */
  cameraDuration: number;

  /**
   * Clip expansion/shrink duration in ms (default: 400).
   * Content fade (opacity) happens simultaneously with clip animation.
   */
  clipDuration: number;

  /**
   * How much the clip animation overlaps with the camera animation tail, 0-1 (default: 0.15).
   * At 0.15, the clip starts when the camera is 85% done. Due to cubic easing,
   * the camera is ~97% of the way to its target at that point.
   */
  overlapRatio: number;

  /** Padding around bounding box for overview framing, as fraction (default: 0.15) */
  overviewPadding: number;

  /**
   * If true, the navigator mirrors the active panel into the URL fragment
   * (e.g. `#quick-links`) and reconciles state from the fragment on load
   * and on browser back/forward. The fragment value is the panel's
   * `data-section` ID so it remains a working anchor in non-3D fallback
   * contexts. Default: true.
   */
  syncUrlHash: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: NavigationConfig = {
  scale: 0.5,
  revealMode: 'transform-mask',
  planeScaleMode: 'css-transform',
  overviewFov: 50,
  detailFov: 50,
  fillPercentage: 0.8,
  cameraDuration: 1000,
  clipDuration: 400,
  overlapRatio: 0.15,
  overviewPadding: 0.15,
  syncUrlHash: true,
};

/**
 * Navigation event types
 */
export type NavigationEventType =
  | 'stateChange'
  | 'zoomStart'
  | 'zoomComplete'
  | 'returnStart'
  | 'returnComplete';

/**
 * Event handler signatures
 */
export type NavigationEventHandler =
  | ((state: NavigationState) => void)
  | ((planeId: string) => void)
  | (() => void);
