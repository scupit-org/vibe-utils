import * as THREE from 'three';

/**
 * CSS3DObject - Wraps a DOM element to be positioned in 3D space
 * The element will have CSS transforms applied by CSS3DRenderer
 */
export class CSS3DObject extends THREE.Object3D {
  element: HTMLElement;

  constructor(element?: HTMLElement) {
    super();
    this.element = element || document.createElement('div');
    this.element.style.position = 'absolute';
    this.element.style.pointerEvents = 'auto';

    this.addEventListener('removed', () => {
      this.traverse((object) => {
        if (object instanceof CSS3DObject) {
          if (object.element.parentNode !== null) {
            object.element.parentNode.removeChild(object.element);
          }
        }
      });
    });
  }

  copy(source: CSS3DObject, recursive?: boolean): this {
    super.copy(source, recursive);
    this.element = source.element.cloneNode(true) as HTMLElement;
    return this;
  }
}

/**
 * CSS3DRenderer - Renders CSS3DObjects by applying CSS matrix3d transforms
 * This allows real DOM elements to be positioned in 3D space with full
 * camera control (position, rotation, FOV)
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
    objects: new WeakMap<CSS3DObject, { style: string }>()
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

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
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
    this.renderObject(scene, camera, cameraCSSMatrix);
  }

  private renderObject(
    object: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    cameraCSSMatrix: string
  ): void {
    if (object instanceof CSS3DObject) {
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
      this.renderObject(child, camera, cameraCSSMatrix);
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
  private getCameraCSSMatrix(matrix: THREE.Matrix4): string {
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
   * Convert object's world matrix to CSS matrix3d
   * The translate(-50%, -50%) centers the object on its position
   */
  private getObjectCSSMatrix(matrix: THREE.Matrix4): string {
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
