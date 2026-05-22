/**
 * @jest-environment jsdom
 */
import {
  ENHANCED_CLASS,
  IS_PANEL_IN_MOTION_CSS_CLASS,
  LITE_VERSION_CLASS,
  markEnhanced,
  shouldEnhance,
} from './enhancement';
import * as packageEntry from './index';
import { ZoomPlaneNavigator } from './zoom-navigation';
import { liteBackend } from './backends/lite';
import { resolveContainerRefs } from './container-refs';

describe('enhancement helpers', () => {
  afterEach(() => {
    document.documentElement.classList.remove(ENHANCED_CLASS, LITE_VERSION_CLASS);
  });

  describe('shouldEnhance', () => {
    it('is true by default', () => {
      expect(shouldEnhance()).toBe(true);
    });

    it('is false when the document is flagged as a lite presentation', () => {
      document.documentElement.classList.add(LITE_VERSION_CLASS);
      expect(shouldEnhance()).toBe(false);
    });
  });

  describe('markEnhanced', () => {
    it('adds the activation class and is idempotent', () => {
      markEnhanced();
      markEnhanced();
      expect(document.documentElement.classList.contains(ENHANCED_CLASS)).toBe(true);
      expect(
        document.documentElement.className.split(/\s+/).filter((c) => c === ENHANCED_CLASS),
      ).toHaveLength(1);
    });
  });
});

describe('ZoomPlaneNavigator lite guard', () => {
  afterEach(() => {
    document.documentElement.classList.remove(ENHANCED_CLASS, LITE_VERSION_CLASS);
  });

  it('refuses to construct on a lite presentation, before touching its arguments', () => {
    document.documentElement.classList.add(LITE_VERSION_CLASS);
    // Args are intentionally invalid: the guard runs first, so they are never
    // dereferenced. The error must be the lite guard, not a downstream crash.
    expect(
      () => new ZoomPlaneNavigator(null as never, null as never),
    ).toThrow(new RegExp(LITE_VERSION_CLASS));
    expect(document.documentElement.classList.contains(ENHANCED_CLASS)).toBe(false);
  });

  it('activates the engine layer before failing on invalid setup in non-lite mode', () => {
    // No lite-version class: the guard passes and `markEnhanced()` runs as the
    // next statement, so the class is present even though construction then
    // throws on the invalid arguments.
    expect(() => new ZoomPlaneNavigator(null as never, null as never)).toThrow();
    expect(document.documentElement.classList.contains(ENHANCED_CLASS)).toBe(true);
  });
});

describe('motion hook (IS_PANEL_IN_MOTION_CSS_CLASS)', () => {
  // This class is public contract: a consumer keys off it to shed expensive
  // visual effects during camera flight. These tests pin both its value and the
  // runtime lifecycle so a future refactor cannot silently break consumers.

  it('has the documented value', () => {
    expect(IS_PANEL_IN_MOTION_CSS_CLASS).toBe('w3dpn-is-moving');
  });

  it('is re-exported from the package entry point', () => {
    expect(packageEntry.IS_PANEL_IN_MOTION_CSS_CLASS).toBe(IS_PANEL_IN_MOTION_CSS_CLASS);
  });

  describe('runtime lifecycle', () => {
    let nav: ZoomPlaneNavigator | null = null;

    function buildDom(): void {
      document.body.innerHTML = `
        <div id="zoom-planes-source">
          <div class="zoom-plane"
               data-zoom-plane="main"
               data-section="page-main"
               data-width="1600"
               data-height="900"
               data-position="0, 0, 0"
               data-rotation="0, 0, 0"
               data-zoom-center>
            <span class="plane-label">Main</span>
          </div>
        </div>
        <div id="scene-container"></div>
        <div id="page-content-container">
          <section id="page-main" class="page-section"><h1>Main</h1></section>
        </div>
        <button id="back-button" class="back-button hidden">Back</button>
      `;
    }

    beforeEach(() => {
      buildDom();
      // Disable URL-hash sync so the test doesn't depend on window.location.
      nav = new ZoomPlaneNavigator(resolveContainerRefs(), liteBackend, { syncUrlHash: false });
    });

    afterEach(() => {
      nav?.destroy();
      nav = null;
      document.body.innerHTML = '';
      document.documentElement.classList.remove(ENHANCED_CLASS, IS_PANEL_IN_MOTION_CSS_CLASS);
    });

    it('is absent at overview rest immediately after construction', () => {
      expect(document.documentElement.classList.contains(IS_PANEL_IN_MOTION_CSS_CLASS)).toBe(false);
    });

    it('is added synchronously when a zoom begins', () => {
      // `zoomInto` sets state to `zooming-in` (which toggles the class on) before
      // awaiting the animation, so the class is present without driving rAF.
      // The returned promise is intentionally not awaited; swallow it so a
      // jsdom-only failure in the downstream camera math can't fail this test.
      void nav!.zoomInto('main').catch(() => {});
      expect(nav!.state).toBe('zooming-in');
      expect(document.documentElement.classList.contains(IS_PANEL_IN_MOTION_CSS_CLASS)).toBe(true);
    });

    it('is removed on destroy()', () => {
      void nav!.zoomInto('main').catch(() => {});
      expect(document.documentElement.classList.contains(IS_PANEL_IN_MOTION_CSS_CLASS)).toBe(true);
      nav!.destroy();
      nav = null;
      expect(document.documentElement.classList.contains(IS_PANEL_IN_MOTION_CSS_CLASS)).toBe(false);
    });
  });
});
