import { Scene, PerspectiveCamera } from './scene';
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
  public scene: Scene;
  public camera: PerspectiveCamera;
  public renderer: CSS3DRenderer;

  private zoomPlanes = new Map<string, CSS3DObjectRef>();
  private planeOpacities = new Map<string, string>();
  private planeConfigs: ZoomPlaneConfig[] = [];
  private config: NavigationConfig;
  private rasterRefreshFrameIds: number[] = [];
  private destroyed = false;

  constructor(
    container: HTMLElement,
    planeConfigs: ZoomPlaneConfig[],
    config: NavigationConfig
  ) {
    this.config = config;
    this.planeConfigs = planeConfigs;

    // Initialize Three.js scene
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
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
      const isBakedScale = this.config.planeScaleMode === 'baked-layout';
      const elementScale = isBakedScale ? this.config.scale : 1;
      const objectScale = isBakedScale ? 1 : this.config.scale;

      // Set dimensions on element
      element.style.width = `${config.width * elementScale}px`;
      element.style.height = `${config.height * elementScale}px`;

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
      object.scale.set(objectScale, objectScale, objectScale);

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
   * Firefox/WebRender can keep stale CSS3D raster/hit-test bounds after normal
   * reloads at non-100% Windows display scaling. A one-frame transparent
   * outline forces transformed panel bounds to rebuild without changing final
   * visuals.
   */
  schedulePostLoadRasterRefresh(): void {
    this.queueAnimationFrame(() => {
      this.queueAnimationFrame(() => {
        this.forceRasterRefresh();
      });
    });
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
      const next = String(opacity);
      if (this.planeOpacities.get(id) === next) {
        return;
      }
      this.planeOpacities.set(id, next);
      plane.element.style.opacity = next;
    }
  }

  private forceRasterRefresh(): void {
    if (this.destroyed) {
      return;
    }

    const previousOutlines = Array.from(this.zoomPlanes.values(), ({ element }) => ({
      element,
      outline: element.style.outline,
    }));

    for (const { element } of previousOutlines) {
      element.style.outline = '1px solid transparent';
    }

    this.queueAnimationFrame(() => {
      for (const { element, outline } of previousOutlines) {
        element.style.outline = outline;
      }
    });
  }

  private queueAnimationFrame(callback: FrameRequestCallback): void {
    const id = window.requestAnimationFrame((time) => {
      this.rasterRefreshFrameIds = this.rasterRefreshFrameIds.filter(frameId => frameId !== id);
      callback(time);
    });
    this.rasterRefreshFrameIds.push(id);
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.destroyed = true;
    for (const frameId of this.rasterRefreshFrameIds) {
      window.cancelAnimationFrame(frameId);
    }
    this.rasterRefreshFrameIds = [];

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
