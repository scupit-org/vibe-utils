import type { ScreenRect } from './types';
import { screenRectToClipPath } from './projection';

/**
 * ClipController - Manages clip-path state and page section visibility.
 *
 * Pure state manager - no animation loops. The animation timeline drives
 * state changes by calling setClipRect/setOpacity each frame.
 *
 * Controls:
 * - The clip-path on the page content container
 * - Which page section is visible
 * - Container opacity
 * - Container visibility classes
 */
export class ClipController {
  private container: HTMLElement;
  private sections = new Map<string, HTMLElement>();

  constructor(contentContainer: HTMLElement) {
    this.container = contentContainer;

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
   * Set the clip-path from a screen-space rectangle.
   */
  setClipRect(rect: ScreenRect): void {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    this.container.style.clipPath = screenRectToClipPath(rect, viewportWidth, viewportHeight);
  }

  /**
   * Remove the clip-path (show full content).
   */
  removeClip(): void {
    this.container.style.clipPath = 'none';
    this.container.classList.add('fully-visible');
  }

  /**
   * Reset to fully clipped state (invisible).
   */
  resetClip(): void {
    this.container.classList.remove('fully-visible');
    this.container.style.clipPath = 'inset(50% 50% 50% 50%)';
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
    } else {
      this.container.classList.remove('visible');
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
   * Re-enables clip at full viewport.
   */
  prepareForZoomOut(): void {
    this.container.classList.remove('fully-visible');
    this.container.style.clipPath = 'inset(0% 0% 0% 0%)';
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
}
