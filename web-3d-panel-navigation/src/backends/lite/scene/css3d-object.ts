import { Object3D } from './object3d';

/**
 * CSS3DObject - Wraps a DOM element to be positioned in 3D space.
 * The shared CSS3DRenderer applies CSS matrix3d transforms based on each
 * object's matrixWorld.
 *
 * The `isCSS3DObject: true` runtime tag lets the shared CSS3DRenderer detect
 * these objects across both backends without resorting to `instanceof` against
 * any backend-specific class. Within this module we can still use `instanceof
 * CSS3DObject` directly, since a lite-backend Object3D only ever has
 * lite-backend descendants.
 */
export class CSS3DObject extends Object3D {
  readonly isCSS3DObject: true = true;
  element: HTMLElement;

  constructor(element?: HTMLElement) {
    super();
    this.element = element || document.createElement('div');
    this.element.style.position = 'absolute';
    this.element.style.pointerEvents = 'auto';

    this.addEventListener('removed', () => {
      this.traverse((object) => {
        if (object instanceof CSS3DObject) {
          const el = object.element;
          if (el.parentNode !== null) {
            el.parentNode.removeChild(el);
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
