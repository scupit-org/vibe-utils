import { Object3D } from "three";

/**
 * Three-backend CSS3DObject. Subclasses three's `Object3D` and carries the
 * `isCSS3DObject: true` tag the shared CSS3DRenderer reads to identify
 * CSS3D-aware nodes during traversal — same tag the lite-backend CSS3DObject
 * uses. The instanceof check from the previous CSS3DRenderer implementation
 * has been replaced by this tag, so the same renderer class works against
 * either backend without depending on either's prototypes. Within this module
 * we can still use `instanceof CSS3DObject` directly, since a three-backend
 * Object3D only ever has three-backend descendants.
 */
export class CSS3DObject extends Object3D {
  readonly isCSS3DObject: true = true;
  element: HTMLElement;

  constructor(element?: HTMLElement) {
    super();
    this.element = element || document.createElement("div");
    this.element.style.position = "absolute";
    this.element.style.pointerEvents = "auto";

    this.addEventListener("removed", () => {
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
