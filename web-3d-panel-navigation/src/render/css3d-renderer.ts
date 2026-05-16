import type {
  CSS3DObjectLike,
  Matrix4Like,
  Object3DLike,
  PerspectiveCameraLike,
  SceneLike,
} from '../render-contract';

/**
 * Backend-agnostic CSS3D renderer.
 *
 * Operates against the structural interfaces declared in `render-contract` so
 * both the lite and three backends can plug in their own Object3D/Scene/
 * PerspectiveCamera implementations. CSS3D-aware nodes are identified by a
 * runtime `isCSS3DObject: true` tag instead of `instanceof`, which keeps this
 * file free of any backend-specific class imports.
 */
export class CSS3DRenderer {
  domElement: HTMLDivElement;
  private cameraElement: HTMLDivElement;
  private width: number = 0;
  private height: number = 0;
  private widthHalf: number = 0;
  private heightHalf: number = 0;

  private cache = {
    camera: { fov: 0, style: '' },
    objects: new WeakMap<CSS3DObjectLike, { style: string }>(),
  };

  constructor() {
    // Main container element
    this.domElement = document.createElement('div');
    this.domElement.style.overflow = 'hidden';
    // Perspective origin at center (default is 50% 50%)
    this.domElement.style.perspectiveOrigin = '50% 50%';

    // Camera element - this holds all the 3D-transformed content
    // The centering is done via translate in the camera transform
    this.cameraElement = document.createElement('div');
    this.cameraElement.style.transformStyle = 'preserve-3d';
    this.cameraElement.style.pointerEvents = 'none';
    this.cameraElement.style.position = 'absolute';
    this.cameraElement.style.top = '0';
    this.cameraElement.style.left = '0';

    this.domElement.appendChild(this.cameraElement);
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.widthHalf = width / 2;
    this.heightHalf = height / 2;

    this.domElement.style.width = `${width}px`;
    this.domElement.style.height = `${height}px`;

    this.cameraElement.style.width = `${width}px`;
    this.cameraElement.style.height = `${height}px`;
  }

  render(scene: SceneLike, camera: PerspectiveCameraLike): void {
    const fov = camera.projectionMatrix.elements[5] * this.heightHalf;

    // Update perspective on domElement
    if (this.cache.camera.fov !== fov) {
      if (camera.isPerspectiveCamera) {
        this.domElement.style.perspective = `${fov}px`;
      }
      this.cache.camera.fov = fov;
    }

    // Update world matrices
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (camera.parent === null) camera.updateMatrixWorld();

    // CRITICAL: Explicitly compute matrixWorldInverse from matrixWorld
    // Three.js does NOT auto-compute this; it must be done manually
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // Apply camera transform to cameraElement
    // The translate at the end shifts the coordinate origin from top-left to viewport center
    const cameraCSSMatrix = this.getCameraCSSMatrix(camera.matrixWorldInverse);
    const style = `translateZ(${fov}px)${cameraCSSMatrix}translate(${this.widthHalf}px,${this.heightHalf}px)`;

    if (this.cache.camera.style !== style) {
      this.cameraElement.style.transform = style;
      this.cache.camera.style = style;
    }

    // Render all objects in the scene
    this.renderObject(scene);
  }

  private renderObject(object: Object3DLike): void {
    if (isCSS3DObject(object)) {
      const style = this.getObjectCSSMatrix(object.matrixWorld);
      const element = object.element;
      const cachedObject = this.cache.objects.get(object);

      if (cachedObject === undefined || cachedObject.style !== style) {
        element.style.transform = style;
        this.cache.objects.set(object, { style });
      }

      // Ensure element is in the cameraElement
      if (element.parentNode !== this.cameraElement) {
        this.cameraElement.appendChild(element);
      }
    }

    // Recursively render children
    for (const child of object.children) {
      this.renderObject(child);
    }
  }

  /**
   * Epsilon function to avoid floating point precision issues in CSS
   */
  private epsilon(value: number): number {
    return Math.abs(value) < 1e-10 ? 0 : value;
  }

  /**
   * Convert camera's inverse world matrix to CSS matrix3d
   */
  private getCameraCSSMatrix(matrix: Matrix4Like): string {
    const elements = matrix.elements;

    return 'matrix3d(' +
      this.epsilon(elements[0]) + ',' +
      this.epsilon(-elements[1]) + ',' +
      this.epsilon(elements[2]) + ',' +
      this.epsilon(elements[3]) + ',' +
      this.epsilon(elements[4]) + ',' +
      this.epsilon(-elements[5]) + ',' +
      this.epsilon(elements[6]) + ',' +
      this.epsilon(elements[7]) + ',' +
      this.epsilon(elements[8]) + ',' +
      this.epsilon(-elements[9]) + ',' +
      this.epsilon(elements[10]) + ',' +
      this.epsilon(elements[11]) + ',' +
      this.epsilon(elements[12]) + ',' +
      this.epsilon(-elements[13]) + ',' +
      this.epsilon(elements[14]) + ',' +
      this.epsilon(elements[15]) +
    ')';
  }

  /**
   * Convert object's world matrix to CSS matrix3d.
   * The translate(-50%, -50%) centers the object on its position.
   */
  private getObjectCSSMatrix(matrix: Matrix4Like): string {
    const elements = matrix.elements;

    const matrix3d = 'matrix3d(' +
      this.epsilon(elements[0]) + ',' +
      this.epsilon(elements[1]) + ',' +
      this.epsilon(elements[2]) + ',' +
      this.epsilon(elements[3]) + ',' +
      this.epsilon(-elements[4]) + ',' +
      this.epsilon(-elements[5]) + ',' +
      this.epsilon(-elements[6]) + ',' +
      this.epsilon(-elements[7]) + ',' +
      this.epsilon(elements[8]) + ',' +
      this.epsilon(elements[9]) + ',' +
      this.epsilon(elements[10]) + ',' +
      this.epsilon(elements[11]) + ',' +
      this.epsilon(elements[12]) + ',' +
      this.epsilon(elements[13]) + ',' +
      this.epsilon(elements[14]) + ',' +
      this.epsilon(elements[15]) +
    ')';

    // translate3d(-50%,-50%,0) centers the element on its 3D position
    return `translate3d(-50%,-50%,0)${matrix3d}`;
  }
}

function isCSS3DObject(object: Object3DLike): object is CSS3DObjectLike {
  return (object as Partial<CSS3DObjectLike>).isCSS3DObject === true;
}
