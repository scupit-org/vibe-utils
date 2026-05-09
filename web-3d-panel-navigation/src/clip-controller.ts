import type { RevealMode, ScreenRect } from './types';
import { screenRectToClipPath } from './projection';

/**
 * ClipController - Manages content reveal state and page section visibility.
 *
 * Pure state manager - no animation loops. The animation timeline drives
 * state changes by calling setClipRect/setOpacity each frame.
 *
 * Controls:
 * - The reveal rect on the page content container
 * - Which page section is visible
 * - Container opacity
 * - Container visibility classes
 */
export class ClipController {
  private container: HTMLElement;
  private transformInner: HTMLElement | null;
  private revealMode: RevealMode;
  private sections = new Map<string, HTMLElement>();

  constructor(contentContainer: HTMLElement, revealMode: RevealMode = 'transform-mask') {
    this.container = contentContainer;
    this.revealMode = revealMode;
    this.container.style.pointerEvents = this.container.classList.contains('visible') ? 'auto' : 'none';
    this.transformInner = revealMode === 'transform-mask'
      ? this.ensureTransformInner(contentContainer)
      : null;

    const sectionElements = contentContainer.querySelectorAll('.page-section');
    sectionElements.forEach(el => {
      const id = el.id;
      if (id) {
        this.sections.set(id, el as HTMLElement);
      }
    });
  }

  hasSection(sectionId: string): boolean {
    return this.sections.has(sectionId);
  }

  /**
   * Set the visible content rect from a screen-space rectangle.
   */
  setClipRect(rect: ScreenRect): void {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (this.revealMode === 'clip-path') {
      this.container.style.clipPath = screenRectToClipPath(rect, viewportWidth, viewportHeight);
      return;
    }

    this.applyTransformReveal(rect, viewportWidth, viewportHeight);
  }

  /**
   * Remove the reveal constraint (show full content).
   */
  removeClip(): void {
    this.container.style.clipPath = 'none';
    this.resetTransformReveal();
    this.container.classList.add('fully-visible');
  }

  /**
   * Reset to fully concealed state (invisible).
   */
  resetClip(): void {
    this.container.classList.remove('fully-visible');
    if (this.revealMode === 'clip-path') {
      this.container.style.clipPath = 'inset(50% 50% 50% 50%)';
    } else {
      this.container.style.clipPath = 'none';
      this.resetTransformReveal();
    }
  }

  /**
   * Show a specific page section.
   */
  showSection(sectionId: string): void {
    if (!this.sections.has(sectionId)) {
      throw new ReferenceError(`Page section not found: "${sectionId}"`);
    }

    this.sections.forEach((el, id) => {
      if (id === sectionId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  /**
   * Hide all sections.
   */
  hideAllSections(): void {
    this.sections.forEach(el => {
      el.classList.remove('active');
    });
  }

  /**
   * Set container opacity.
   */
  setOpacity(opacity: number): void {
    this.container.style.opacity = String(opacity);
  }

  /**
   * Reset both the viewport and the scrollable content container.
   */
  resetScroll(): void {
    this.container.scrollTop = 0;
    this.container.scrollLeft = 0;
    window.scrollTo(0, 0);
  }

  /**
   * Set container visibility class.
   */
  setVisible(visible: boolean): void {
    if (visible) {
      this.container.classList.add('visible');
      this.container.style.pointerEvents = 'auto';
    } else {
      this.container.classList.remove('visible');
      this.container.style.pointerEvents = 'none';
    }
  }

  /**
   * Prepare for zoom-in transition.
   * Shows the target section and sets initial clip + opacity state.
   */
  prepareForZoomIn(sectionId: string, initialRect: ScreenRect): void {
    this.showSection(sectionId);
    this.setVisible(true);
    this.setClipRect(initialRect);
    this.setOpacity(0);
  }

  /**
   * Complete zoom-in transition.
   * Removes clip and enables scrolling.
   */
  completeZoomIn(): void {
    this.removeClip();
    this.setOpacity(1);
  }

  /**
   * Prepare for zoom-out transition.
   * Re-enables the reveal constraint at full viewport.
   */
  prepareForZoomOut(): void {
    this.container.classList.remove('fully-visible');
    if (this.revealMode === 'clip-path') {
      this.container.style.clipPath = 'inset(0% 0% 0% 0%)';
    } else {
      this.container.style.clipPath = 'none';
      this.resetTransformReveal();
    }
    this.setOpacity(1);
  }

  /**
   * Complete zoom-out transition.
   * Hides content and resets state.
   */
  completeZoomOut(): void {
    this.setVisible(false);
    this.hideAllSections();
    this.resetClip();
    this.resetScroll();
    this.setOpacity(0);
  }

  private ensureTransformInner(contentContainer: HTMLElement): HTMLElement {
    for (const child of Array.from(contentContainer.children)) {
      if (child.classList.contains('w3dpn-content-transform-inner')) {
        return child as HTMLElement;
      }
    }

    const inner = document.createElement('div');
    inner.className = 'w3dpn-content-transform-inner';
    while (contentContainer.firstChild) {
      inner.appendChild(contentContainer.firstChild);
    }
    contentContainer.appendChild(inner);
    return inner;
  }

  private applyTransformReveal(
    rect: ScreenRect,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    const safeViewportWidth = Math.max(viewportWidth, 1);
    const safeViewportHeight = Math.max(viewportHeight, 1);
    const left = this.clamp(rect.left, 0, safeViewportWidth);
    const right = this.clamp(rect.right, 0, safeViewportWidth);
    const top = this.clamp(rect.top, 0, safeViewportHeight);
    const bottom = this.clamp(rect.bottom, 0, safeViewportHeight);
    const width = Math.max(safeViewportWidth - left - right, 1);
    const height = Math.max(safeViewportHeight - top - bottom, 1);
    const scaleX = width / safeViewportWidth;
    const scaleY = height / safeViewportHeight;
    const inverseScaleX = 1 / scaleX;
    const inverseScaleY = 1 / scaleY;

    this.container.style.clipPath = 'none';
    this.container.style.transformOrigin = 'top left';
    this.container.style.transform = `matrix(${scaleX}, 0, 0, ${scaleY}, ${left}, ${top})`;

    if (this.transformInner) {
      this.transformInner.style.transformOrigin = 'top left';
      this.transformInner.style.width = `${safeViewportWidth}px`;
      this.transformInner.style.minHeight = `${safeViewportHeight}px`;
      this.transformInner.style.transform =
        `matrix(${inverseScaleX}, 0, 0, ${inverseScaleY}, ${-left * inverseScaleX}, ${-top * inverseScaleY})`;
    }
  }

  private resetTransformReveal(): void {
    this.container.style.transform = '';

    if (this.transformInner) {
      this.transformInner.style.transform = '';
      this.transformInner.style.width = '';
      this.transformInner.style.minHeight = '';
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
