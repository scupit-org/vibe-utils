import type {
  NavigationEventHandler,
  NavigationEventType,
  NavigationState,
  ZoomPlaneConfig,
} from './types';

/**
 * Minimal navigator surface consumed by HashUrlSync.
 *
 * Defined structurally to avoid a circular import on `ZoomPlaneNavigator`
 * itself — the sync only needs the navigation methods, the read-only
 * state, and the event subscribe/unsubscribe pair.
 */
export interface UrlSyncNavigator {
  readonly state: NavigationState;
  readonly activePlane: string | null;
  zoomInto(planeId: string): Promise<void>;
  returnToOverview(): Promise<void>;
  snapToSection(planeId: string): void;
  on(event: NavigationEventType, handler: NavigationEventHandler): void;
  off(event: NavigationEventType, handler: NavigationEventHandler): void;
}

/**
 * HashUrlSync — bidirectional synchronization between the URL fragment and
 * the navigator's active panel.
 *
 * The fragment value is the panel's `data-section` ID, so the same URL
 * remains a working anchor link in a non-3D fallback context (the browser
 * will natively scroll to `<section id="...">` with no JS).
 *
 * Direction A (navigator -> URL): zoomStart pushes the section hash,
 * returnStart clears it. Both use `history.pushState`, which creates real
 * history entries and does not fire `hashchange`, so loop prevention is
 * trivial.
 *
 * Direction B (URL -> navigator): a single `hashchange` listener catches
 * back, forward, manual edits, and programmatic `location.hash` writes.
 * The reentrancy guard `isReactingToHash` suppresses URL writes for the
 * navigation calls we issue from this listener.
 *
 * Mid-animation hash changes are deferred — the navigator rejects calls
 * while in `zooming-in` / `zooming-out`. Once it lands in a terminal
 * state, the `stateChange` handler re-runs reconcile so the URL still
 * wins eventually.
 */
export class HashUrlSync {
  private navigator: UrlSyncNavigator;
  private sectionToPlaneId: Map<string, string>;
  private planeIdToSection: Map<string, string>;

  private isReactingToHash = false;

  private boundHashChangeHandler: () => void;
  private zoomStartHandler: NavigationEventHandler;
  private returnStartHandler: NavigationEventHandler;
  private stateChangeHandler: NavigationEventHandler;

  constructor(
    navigator: UrlSyncNavigator,
    planeConfigs: ReadonlyArray<ZoomPlaneConfig>
  ) {
    this.navigator = navigator;

    this.sectionToPlaneId = new Map();
    this.planeIdToSection = new Map();
    for (const config of planeConfigs) {
      this.sectionToPlaneId.set(config.sectionId, config.id);
      this.planeIdToSection.set(config.id, config.sectionId);
    }

    this.zoomStartHandler = ((planeId: string) => {
      if (this.isReactingToHash) return;
      const sectionId = this.planeIdToSection.get(planeId);
      if (sectionId) {
        this.writeHash(sectionId);
      }
    }) as NavigationEventHandler;

    this.returnStartHandler = (() => {
      if (this.isReactingToHash) return;
      this.clearHash();
    }) as NavigationEventHandler;

    this.stateChangeHandler = ((state: NavigationState) => {
      if (state === 'overview' || state === 'section') {
        this.reconcile();
      }
    }) as NavigationEventHandler;

    this.boundHashChangeHandler = () => this.reconcile();

    this.navigator.on('zoomStart', this.zoomStartHandler);
    this.navigator.on('returnStart', this.returnStartHandler);
    this.navigator.on('stateChange', this.stateChangeHandler);
    window.addEventListener('hashchange', this.boundHashChangeHandler);
  }

  /**
   * Inspect `location.hash` once during construction. If it matches a
   * known section, snap directly into that section without animation.
   * Unknown or absent hashes leave both the URL and navigator alone.
   */
  reconcileInitial(): void {
    const rawHash = this.currentRawHash();
    if (rawHash === null) return;

    const planeId = this.sectionToPlaneId.get(rawHash);
    if (planeId === undefined) return;

    this.isReactingToHash = true;
    try {
      this.navigator.snapToSection(planeId);
    } finally {
      this.isReactingToHash = false;
    }
  }

  destroy(): void {
    window.removeEventListener('hashchange', this.boundHashChangeHandler);
    this.navigator.off('zoomStart', this.zoomStartHandler);
    this.navigator.off('returnStart', this.returnStartHandler);
    this.navigator.off('stateChange', this.stateChangeHandler);
  }

  private reconcile(): void {
    const state = this.navigator.state;
    if (state !== 'overview' && state !== 'section') {
      return;
    }

    const rawHash = this.currentRawHash();
    const targetPlaneId = rawHash === null
      ? null
      : this.sectionToPlaneId.get(rawHash) ?? null;

    if (targetPlaneId === null) {
      if (rawHash !== null && state === 'overview') {
        return;
      }
      if (state === 'section') {
        this.callWithFlag(() => { this.navigator.returnToOverview(); });
      }
      return;
    }

    if (state === 'overview') {
      this.callWithFlag(() => { this.navigator.zoomInto(targetPlaneId); });
      return;
    }

    if (this.navigator.activePlane === targetPlaneId) {
      return;
    }
    this.callWithFlag(() => { this.navigator.returnToOverview(); });
  }

  private callWithFlag(fn: () => void): void {
    this.isReactingToHash = true;
    try {
      fn();
    } finally {
      this.isReactingToHash = false;
    }
  }

  private writeHash(sectionId: string): void {
    const url = `${window.location.pathname}${window.location.search}#${sectionId}`;
    window.history.pushState(null, '', url);
  }

  private clearHash(): void {
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.pushState(null, '', url);
  }

  private currentRawHash(): string | null {
    const hash = window.location.hash;
    if (!hash || hash === '#') return null;
    return hash.slice(1);
  }
}
