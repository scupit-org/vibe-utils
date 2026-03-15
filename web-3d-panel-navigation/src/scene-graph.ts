import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from './css3d-renderer';
import type { ZoomPlaneConfig, CSS3DObjectRef, NavigationConfig } from './types';
import { findZoomPlane } from './zoom-plane-parser';

/**
 * SceneGraph - Manages the Three.js scene, camera, CSS3D renderer, and plane objects.
 *
 * Responsibilities:
 * - Scene, camera, and renderer initialization
 * - CSS3DObject creation from plane configs
 * - Rendering (single pass, called externally by the animation timeline)
 * - Resize handling (camera aspect + renderer size)
 * - Plane opacity control
 *
 * Does NOT own: rAF loop, overview camera calculation, visibility toggling, event handling
 */
export class SceneGraph {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: CSS3DRenderer;

  private zoomPlanes = new Map<string, CSS3DObjectRef>();
  private planeConfigs: ZoomPlaneConfig[] = [];
  private config: NavigationConfig;

  constructor(
    container: HTMLElement,
    planeConfigs: ZoomPlaneConfig[],
    config: NavigationConfig
  ) {
    this.config = config;
    this.planeConfigs = planeConfigs;

    // Initialize Three.js scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      config.overviewFov,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );

    // Initialize CSS3D renderer
    this.renderer = new CSS3DRenderer();
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    container.appendChild(this.renderer.domElement);

    // Create CSS3D objects for each zoom plane
    this.createZoomPlaneObjects();
  }

  private createZoomPlaneObjects(): void {
    for (const config of this.planeConfigs) {
      const element = config.element;

      // Set dimensions on element
      element.style.width = `${config.width}px`;
      element.style.height = `${config.height}px`;

      // Create CSS3DObject
      const object = new CSS3DObject(element);
      object.position.set(
        config.position[0],
        config.position[1],
        config.position[2]
      );
      object.rotation.set(
        config.rotation[0],
        config.rotation[1],
        config.rotation[2]
      );
      object.scale.set(this.config.scale, this.config.scale, this.config.scale);

      this.scene.add(object);
      this.zoomPlanes.set(config.id, { object, element });
    }
  }

  /**
   * Perform a single render pass.
   */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Update camera aspect ratio and renderer size.
   */
  setSize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Get a zoom plane's CSS3DObject reference by ID.
   */
  getZoomPlane(id: string): CSS3DObjectRef | undefined {
    return this.zoomPlanes.get(id);
  }

  /**
   * Get all zoom plane configs.
   */
  getPlaneConfigs(): ZoomPlaneConfig[] {
    return this.planeConfigs;
  }

  /**
   * Get a specific zoom plane config by ID.
   */
  getPlaneConfig(id: string): ZoomPlaneConfig | undefined {
    return findZoomPlane(this.planeConfigs, id);
  }

  /**
   * Get the scale factor.
   */
  getScale(): number {
    return this.config.scale;
  }

  /**
   * Set zoom plane placeholder opacity.
   */
  setPlaneOpacity(id: string, opacity: number): void {
    const plane = this.zoomPlanes.get(id);
    if (plane) {
      plane.element.style.opacity = String(opacity);
    }
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
