/**
 * Render-contract module.
 *
 * Backend-agnostic interfaces enumerating exactly the methods and fields the
 * navigator core relies on, plus the `RenderBackend<T>` factory contract that
 * each backend (`liteBackend`, `threeBackend`) implements.
 *
 * This module has no runtime imports of three or of any backend-specific
 * primitives. It must remain importable from anywhere in the library or by
 * external consumers without bringing in either backend.
 *
 * Naming convention: structural interfaces end with `Like` (e.g. `Vec3Like`)
 * so they can never be confused with concrete classes from the backends.
 */

export type EulerOrderLike = 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY';

/**
 * Minimal Vector3 surface — all methods/fields the navigator core mutates or
 * reads. Backend Vector3 classes (three's and lite's) both satisfy this.
 */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): this;
  copy(v: Vec3Like): this;
  clone(): Vec3Like;
  add(v: Vec3Like): this;
  addScaledVector(v: Vec3Like, s: number): this;
  sub(v: Vec3Like): this;
  subVectors(a: Vec3Like, b: Vec3Like): this;
  multiplyScalar(s: number): this;
  dot(v: Vec3Like): number;
  cross(v: Vec3Like): this;
  normalize(): this;
  length(): number;
  lengthSq(): number;
  distanceTo(v: Vec3Like): number;
  lerpVectors(a: Vec3Like, b: Vec3Like, t: number): this;
  applyEuler(e: EulerLike): this;
  applyQuaternion(q: QuaternionLike): this;
  /**
   * Projects this vector through camera.matrixWorldInverse and
   * camera.projectionMatrix. The CSS3D renderer doesn't call this directly,
   * but projection.ts does.
   */
  project(camera: { matrixWorldInverse: Matrix4Like; projectionMatrix: Matrix4Like }): this;
}

export interface EulerLike {
  x: number;
  y: number;
  z: number;
  order: EulerOrderLike;
  set(x: number, y: number, z: number, order?: EulerOrderLike): this;
  copy(e: EulerLike): this;
  setFromQuaternion(q: QuaternionLike, order?: EulerOrderLike): this;
}

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
  setFromEuler(e: EulerLike): this;
  setFromAxisAngle(axis: Vec3Like, angle: number): this;
  multiply(q: QuaternionLike): this;
  clone(): QuaternionLike;
  dot(q: QuaternionLike): number;
}

/**
 * 4x4 matrix surface — same column-major element layout as three.js. The
 * CSS3D renderer reads `elements[i]` directly to build CSS matrix3d strings,
 * so the underlying numeric layout must match three's exactly. The container
 * type itself is `ArrayLike<number>` because three's `Matrix4` stores a plain
 * `Array` while the lite `Matrix4` stores a `Float32Array` — both are
 * read-by-index identically.
 */
export interface Matrix4Like {
  elements: ArrayLike<number>;
  copy(m: Matrix4Like): this;
  invert(): this;
  multiplyMatrices(a: Matrix4Like, b: Matrix4Like): this;
}

/**
 * Minimal Object3D — the scene-graph node type. Both three.Object3D and the
 * lite Object3D satisfy this. Note that the field types are structural here;
 * the backend's concrete Object3D will use its own concrete Vec3/Euler types,
 * but those types in turn satisfy the *Like interfaces above.
 */
export interface Object3DLike {
  position: Vec3Like;
  rotation: EulerLike;
  scale: Vec3Like;
  up: Vec3Like;
  matrix: Matrix4Like;
  matrixWorld: Matrix4Like;
  matrixWorldAutoUpdate: boolean;
  parent: Object3DLike | null;
  children: Object3DLike[];
  add(child: Object3DLike): unknown;
  remove(child: Object3DLike): unknown;
  traverse(callback: (object: Object3DLike) => void): void;
  updateMatrix(): void;
  updateMatrixWorld(force?: boolean): void;
  lookAt(target: Vec3Like | number, y?: number, z?: number): void;
  addEventListener(type: string, listener: (event: { type: string }) => void): void;
  removeEventListener(type: string, listener: (event: { type: string }) => void): void;
  dispatchEvent(event: { type: string }): void;
}

/**
 * Scene is structurally just an Object3D root with `matrixWorldAutoUpdate`.
 * Distinguishing it lets the navigator typecheck that it isn't accidentally
 * adding a Scene to another Scene.
 *
 * Intentionally empty: SceneLike is declared as a distinct interface (rather
 * than a type alias for Object3DLike) purely so `SceneGraph.scene: T['Scene']`
 * is named meaningfully at the type level. If a stricter linter ever flags
 * this with `no-empty-interface`, disable the rule here rather than collapsing
 * the interface — the naming is the whole point.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SceneLike extends Object3DLike {}

export interface PerspectiveCameraLike extends Object3DLike {
  /**
   * Runtime tag the CSS3D renderer reads to detect perspective cameras.
   *
   * Typed as `boolean` rather than the literal `true` so that three.js's own
   * `PerspectiveCamera` (whose declaration types this field as `boolean`) is
   * structurally assignable to `PerspectiveCameraLike`. In practice the value
   * is always `true` for anything constructed via a backend's
   * `createPerspectiveCamera`; the `RenderBackend` contract parity tests in
   * `src/backends/backend-parity.test.ts` assert that invariant at runtime,
   * and the CSS3D renderer treats any falsy value as "not a perspective
   * camera" and silently skips the perspective-style update.
   */
  readonly isPerspectiveCamera: boolean;
  fov: number;
  aspect: number;
  near: number;
  far: number;
  projectionMatrix: Matrix4Like;
  matrixWorldInverse: Matrix4Like;
  updateProjectionMatrix(): void;
}

/**
 * CSS3DObject is an Object3D that owns a DOM element. The `isCSS3DObject` tag
 * lets the shared CSS3D renderer identify these objects without an
 * `instanceof` check against any backend-specific class.
 */
export interface CSS3DObjectLike extends Object3DLike {
  readonly isCSS3DObject: true;
  element: HTMLElement;
}

/**
 * Wraps a DOM container that the CSS3D-transformed elements are appended into.
 * Both backends share a single concrete implementation under src/render/.
 */
export interface CSS3DRendererLike {
  domElement: HTMLDivElement;
  setSize(width: number, height: number): void;
  render(scene: SceneLike, camera: PerspectiveCameraLike): void;
}

/**
 * Skybox host — owns a canvas, runs an rAF loop, accepts a backend-specific
 * skybox value, and reads camera state to render each frame. The host's
 * camera type and the backend skybox type are pinned by the backend in
 * its `RenderTypes['SkyboxHostOptions']` slot.
 */
export interface SkyboxHostLike {
  start(): void;
  stop(): void;
  setPixelRatio(pixelRatio?: number | ((devicePixelRatio: number) => number)): void;
  renderFrame(dt?: number): void;
  refresh(): void;
  destroy(): void;
}

/**
 * The full set of concrete render primitive types a backend provides. Each
 * backend extends this with concrete classes; downstream generic code reads
 * the slots through `T['Vector3']`, `T['PerspectiveCamera']`, etc.
 */
export interface RenderTypes {
  Vector3: Vec3Like;
  Euler: EulerLike;
  Quaternion: QuaternionLike;
  Matrix4: Matrix4Like;
  Object3D: Object3DLike;
  Scene: SceneLike;
  PerspectiveCamera: PerspectiveCameraLike;
  CSS3DObject: CSS3DObjectLike;
  CSS3DRenderer: CSS3DRendererLike;
  Skybox: unknown;
  SkyboxHost: SkyboxHostLike;
  SkyboxHostOptions: unknown;
}

/**
 * Backend contract. Each backend implements this interface against its own
 * `RenderTypes` extension. The library's generic code (`SceneGraph<T>`,
 * `CameraController<T>`, `ZoomPlaneNavigator<T>`) accepts a `RenderBackend<T>`
 * and never constructs primitives directly with `new`.
 */
export interface RenderBackend<T extends RenderTypes = RenderTypes> {
  createVector3(x?: number, y?: number, z?: number): T['Vector3'];
  createEuler(x?: number, y?: number, z?: number, order?: EulerOrderLike): T['Euler'];
  createQuaternion(x?: number, y?: number, z?: number, w?: number): T['Quaternion'];
  createMatrix4(): T['Matrix4'];

  createObject3D(): T['Object3D'];
  createScene(): T['Scene'];
  createPerspectiveCamera(
    fov?: number,
    aspect?: number,
    near?: number,
    far?: number,
  ): T['PerspectiveCamera'];

  /**
   * Constructs a CSS3D-aware node from a DOM element. The returned object is
   * tagged `isCSS3DObject: true` so the shared CSS3DRenderer can pick it out
   * during scene traversal.
   */
  createCSS3DObject(element: HTMLElement): T['CSS3DObject'];

  /** Constructs the CSS3D container/renderer used for panel transforms. */
  createCSS3DRenderer(): T['CSS3DRenderer'];

  /**
   * Constructs a backend-specific skybox host bound to the given options.
   * The options type is pinned by the backend so the camera and skybox
   * fields are type-checked against the backend's concrete classes.
   */
  createSkyboxHost(options: T['SkyboxHostOptions']): T['SkyboxHost'];
}
