/**
 * @jest-environment jsdom
 */
import {
  ENHANCED_CLASS,
  LITE_VERSION_CLASS,
  markEnhanced,
  shouldEnhance,
} from './enhancement';
import { ZoomPlaneNavigator } from './zoom-navigation';

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
