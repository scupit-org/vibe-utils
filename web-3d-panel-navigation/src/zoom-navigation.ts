import { SceneGraph } from './scene-graph';
import { CameraController } from './camera-controller';
import { ClipController } from './clip-controller';
import { AnimationTimeline } from './animation-timeline';
import { calculateOverviewState } from './overview-camera';
import { parseAllZoomPlanes } from './zoom-plane-parser';
import { getCenteredPlaneRect, lerpScreenRect, fullViewportRect } from './projection';
import { remap } from './easing';
import { calculateTransitionState } from './camera-transitions';
import { HashUrlSync } from './url-hash-sync';
import type {
  NavigationState, NavigationConfig, NavigationEventType,
  NavigationEventHandler, ZoomPlaneConfig, CameraState, ContainerRefs,
} from './types';
import { DEFAULT_CONFIG } from './types';

/**
 * ZoomPlaneNavigator - Main orchestrating controller for the zoom plane navigation system.
 *
 * Coordinates all subsystems through a unified animation timeline:
 * - SceneGraph (3D rendering)
 * - CameraController (camera state)
 * - ClipController (page content reveal)
 * - AnimationTimeline (single rAF loop)
 */
export class ZoomPlaneNavigator {
  private sceneGraph: SceneGraph;
  private cameraController: CameraController;
  private clipController: ClipController;
  private timeline: AnimationTimeline;
  private refs: ContainerRefs;

  private _state: NavigationState = 'overview';
  private _activePlaneId: string | null = null;

  private config: NavigationConfig;
  private overviewState: CameraState;
  private activeCancel: (() => void) | null = null;

  private eventListeners = new Map<NavigationEventType, Set<NavigationEventHandler>>();
  private planeClickHandlers = new Map<string, EventListener>();
  private backButtonClickHandler: EventListener | null = null;
  private urlSync: HashUrlSync | null = null;

  private boundHandleResize: () => void;
  private boundHandleKeydown: (e: KeyboardEvent) => void;

  constructor(refs: ContainerRefs, config: Partial<NavigationConfig> = {}) {
    this.refs = refs;
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...config });

    const planeConfigs = parseAllZoomPlanes(refs.planesSource);

    this.clipController = new ClipController(refs.contentContainer);
    this.validatePlaneSections(planeConfigs);

    this.sceneGraph = new SceneGraph(refs.sceneContainer, planeConfigs, this.config);

    this.overviewState = calculateOverviewState(
      planeConfigs,
      this.config.scale,
      this.config.overviewFov,
      window.innerWidth / window.innerHeight,
      this.config.overviewPadding
    );

    this.cameraController = new CameraController(
      this.sceneGraph.camera,
      this.overviewState,
      this.config
    );
    this.cameraController.setToState(this.overviewState);

    this.timeline = new AnimationTimeline();
    this.timeline.subscribe('render', () => this.sceneGraph.render());
    this.timeline.start();

    this.setupPlaneClickHandlers();

    if (refs.backButton) {
      this.backButtonClickHandler = () => {
        if (this._state === 'section') {
          this.returnToOverview();
        }
      };
      refs.backButton.addEventListener('click', this.backButtonClickHandler);
    }

    this.boundHandleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this._state === 'section') {
          this.returnToOverview();
        } else if (this._state === 'zooming-in' && this.activeCancel) {
          this.activeCancel();
          this.returnToOverviewFromCurrent();
        }
      }
    };
    window.addEventListener('keydown', this.boundHandleKeydown);

    this.boundHandleResize = () => this.handleResize();
    window.addEventListener('resize', this.boundHandleResize);

    if (this.config.syncUrlHash) {
      this.urlSync = new HashUrlSync(this, this.sceneGraph.getPlaneConfigs());
      this.urlSync.reconcileInitial();
    }
  }

  get state(): NavigationState {
    return this._state;
  }

  get activePlane(): string | null {
    return this._activePlaneId;
  }

  getPlaneConfigs(): ReadonlyArray<ZoomPlaneConfig> {
    return this.sceneGraph.getPlaneConfigs();
  }

  getPlaneConfig(id: string): ZoomPlaneConfig | undefined {
    return this.sceneGraph.getPlaneConfig(id);
  }

  recalculateOverview(): void {
    this.overviewState = calculateOverviewState(
      this.sceneGraph.getPlaneConfigs(),
      this.config.scale,
      this.config.overviewFov,
      window.innerWidth / window.innerHeight,
      this.config.overviewPadding
    );
    this.cameraController.setOverviewState(this.overviewState);

    if (this._state === 'overview') {
      this.cameraController.setToState(this.overviewState);
    }
  }

  getScene(): SceneGraph {
    return this.sceneGraph;
  }

  on(event: NavigationEventType, handler: NavigationEventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: NavigationEventType, handler: NavigationEventHandler): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: NavigationEventType, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const handler of listeners) {
        (handler as Function)(...args);
      }
    }
  }

  async zoomInto(planeId: string): Promise<void> {
    if (this._state !== 'overview') {
      console.warn(`Cannot zoom in: currently in ${this._state} state`);
      return;
    }

    const planeConfig = this.sceneGraph.getPlaneConfig(planeId);
    if (!planeConfig) {
      console.error(`Zoom plane not found: ${planeId}`);
      return;
    }

    this._state = 'zooming-in';
    this._activePlaneId = planeId;
    this.emit('stateChange', this._state);
    this.emit('zoomStart', planeId);

    const startCameraState = this.cameraController.getCurrentState();
    const targetCameraState = this.cameraController.calculatePerpendicularState(
      planeConfig, this.sceneGraph.getScale()
    );

    const planeRect = this.precomputePlaneRect(planeConfig, targetCameraState, startCameraState);

    this.clipController.prepareForZoomIn(planeConfig.sectionId, planeRect);

    const { cameraDuration, clipDuration, overlapRatio } = this.config;
    const totalDuration = cameraDuration + clipDuration * (1 - overlapRatio);
    const cameraEnd = cameraDuration / totalDuration;
    const clipStart = cameraEnd - (overlapRatio * clipDuration / totalDuration);
    const targetRect = fullViewportRect();
    const planeFadeEnd = Math.min(clipStart + 0.08, 1.0);

    const { promise, cancel } = this.timeline.runSequence(totalDuration, (progress) => {
      const rawCameraT = remap(progress, 0, cameraEnd);
      this.cameraController.setToState(
        calculateTransitionState(startCameraState, targetCameraState, rawCameraT)
      );

      if (progress >= clipStart) {
        const clipRaw = remap(progress, clipStart, 1.0);
        const clipT = clipRaw * clipRaw * (3 - 2 * clipRaw);
        const currentRect = lerpScreenRect(planeRect, targetRect, clipT);
        this.clipController.setClipRect(currentRect);
        this.clipController.setOpacity(clipT);
      }

      if (progress >= clipStart) {
        const fadeT = remap(progress, clipStart, planeFadeEnd);
        this.sceneGraph.setPlaneOpacity(planeId, 1 - fadeT);
      }
    });

    this.activeCancel = cancel;
    const completed = await promise;
    this.activeCancel = null;

    if (completed) {
      this.cameraController.setToState(targetCameraState);
      this.completeZoomIn();
    }
  }

  private completeZoomIn(): void {
    this.hideSceneContainer();
    this.clipController.completeZoomIn();

    if (this.refs.backButton) {
      this.refs.backButton.classList.remove('hidden');
    }

    document.body.style.overflow = 'auto';

    this._state = 'section';
    this.emit('stateChange', this._state);
    this.emit('zoomComplete', this._activePlaneId!);
  }

  /**
   * Synchronously enter the section state for a panel without playing the
   * camera or clip-reveal animations. Intended for cold-load deep links
   * where the user landed on a URL like `#quick-links` and should see the
   * section immediately rather than watching the zoom-in play out.
   *
   * Only valid from the `overview` state.
   */
  snapToSection(planeId: string): void {
    if (this._state !== 'overview') {
      console.warn(`Cannot snap to section: currently in ${this._state} state`);
      return;
    }

    const planeConfig = this.sceneGraph.getPlaneConfig(planeId);
    if (!planeConfig) {
      console.error(`Zoom plane not found: ${planeId}`);
      return;
    }

    const targetCameraState = this.cameraController.calculatePerpendicularState(
      planeConfig, this.sceneGraph.getScale()
    );
    this.cameraController.setToState(targetCameraState);
    this.sceneGraph.setPlaneOpacity(planeId, 0);
    this.clipController.prepareForZoomIn(planeConfig.sectionId, fullViewportRect());

    this._activePlaneId = planeId;
    this.completeZoomIn();
  }

  async returnToOverview(): Promise<void> {
    if (this._state !== 'section' || !this._activePlaneId) {
      console.warn(`Cannot return: currently in ${this._state} state`);
      return;
    }

    const planeId = this._activePlaneId;
    const planeConfig = this.sceneGraph.getPlaneConfig(planeId);
    if (!planeConfig) {
      console.error(`Zoom plane not found: ${planeId}`);
      return;
    }

    this._state = 'zooming-out';
    this.emit('stateChange', this._state);
    this.emit('returnStart');

    if (this.refs.backButton) {
      this.refs.backButton.classList.add('hidden');
    }

    document.body.style.overflow = 'hidden';
    this.clipController.resetScroll();

    const perpendicularState = this.cameraController.calculatePerpendicularState(
      planeConfig, this.sceneGraph.getScale()
    );
    this.cameraController.setToState(perpendicularState);

    this.sceneGraph.setPlaneOpacity(planeId, 0);
    this.showSceneContainer();

    this.sceneGraph.render();
    const planeRect = getCenteredPlaneRect(
      planeConfig,
      this.sceneGraph.getScale(),
      this.sceneGraph.camera,
      window.innerWidth,
      window.innerHeight
    );

    this.clipController.prepareForZoomOut();

    const { cameraDuration, clipDuration, overlapRatio } = this.config;
    const totalDuration = clipDuration + cameraDuration * (1 - overlapRatio);
    const clipEnd = clipDuration / totalDuration;
    const cameraStart = clipEnd - (overlapRatio * cameraDuration / totalDuration);
    const fullRect = fullViewportRect();
    const planeFadeStart = Math.max(clipEnd - 0.08, 0);

    const overviewState = this.cameraController.getOverviewState();
    const startCameraState = this.cameraController.getCurrentState();

    const { promise, cancel } = this.timeline.runSequence(totalDuration, (progress) => {
      if (progress <= clipEnd) {
        const clipRaw = remap(progress, 0, clipEnd);
        const clipT = clipRaw * clipRaw * (3 - 2 * clipRaw);
        const currentRect = lerpScreenRect(fullRect, planeRect, clipT);
        this.clipController.setClipRect(currentRect);
        this.clipController.setOpacity(1 - clipT);
      }

      if (progress >= planeFadeStart && progress <= clipEnd) {
        const fadeT = remap(progress, planeFadeStart, clipEnd);
        this.sceneGraph.setPlaneOpacity(planeId, fadeT);
      } else if (progress > clipEnd) {
        this.sceneGraph.setPlaneOpacity(planeId, 1);
      }

      if (progress >= cameraStart) {
        const rawCameraT = remap(progress, cameraStart, 1.0);
        this.cameraController.setToState(
          calculateTransitionState(overviewState, startCameraState, 1 - rawCameraT)
        );
      }
    });

    this.activeCancel = cancel;
    const completed = await promise;
    this.activeCancel = null;

    if (completed) {
      this.cameraController.setToState(overviewState);
      this.completeReturnToOverview();
    }
  }

  private async returnToOverviewFromCurrent(): Promise<void> {
    const planeId = this._activePlaneId;

    this.clipController.completeZoomOut();

    if (planeId) {
      this.sceneGraph.setPlaneOpacity(planeId, 1);
    }

    this._state = 'zooming-out';
    this.emit('stateChange', this._state);

    const startCameraState = this.cameraController.getCurrentState();
    const overviewState = this.cameraController.getOverviewState();

    const { promise, cancel } = this.timeline.runSequence(
      this.config.cameraDuration,
      (progress) => {
        this.cameraController.setToState(
          calculateTransitionState(overviewState, startCameraState, 1 - progress)
        );
      }
    );

    this.activeCancel = cancel;
    const completed = await promise;
    this.activeCancel = null;

    if (completed) {
      this.cameraController.setToState(overviewState);
      this.completeReturnToOverview();
    }
  }

  private completeReturnToOverview(): void {
    this.clipController.completeZoomOut();

    for (const config of this.sceneGraph.getPlaneConfigs()) {
      this.sceneGraph.setPlaneOpacity(config.id, 1);
    }

    this._state = 'overview';
    this._activePlaneId = null;
    this.emit('stateChange', this._state);
    this.emit('returnComplete');
  }

  private precomputePlaneRect(
    planeConfig: ZoomPlaneConfig,
    targetCameraState: CameraState,
    restoreState: CameraState
  ): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } {
    this.cameraController.setToState(targetCameraState);
    this.sceneGraph.render();

    const rect = getCenteredPlaneRect(
      planeConfig,
      this.sceneGraph.getScale(),
      this.sceneGraph.camera,
      window.innerWidth,
      window.innerHeight
    );

    this.cameraController.setToState(restoreState);
    this.sceneGraph.render();

    return rect;
  }

  private validatePlaneSections(planeConfigs: ReadonlyArray<ZoomPlaneConfig>): void {
    for (const planeConfig of planeConfigs) {
      if (!this.clipController.hasSection(planeConfig.sectionId)) {
        throw new ReferenceError(
          `Zoom plane "${planeConfig.id}" references missing section "${planeConfig.sectionId}"`
        );
      }
    }
  }

  private setupPlaneClickHandlers(): void {
    const configs = this.sceneGraph.getPlaneConfigs();
    for (const config of configs) {
      const plane = this.sceneGraph.getZoomPlane(config.id);
      if (plane) {
        const handler: EventListener = () => {
          if (this._state === 'overview') {
            this.zoomInto(config.id);
          }
        };

        this.planeClickHandlers.set(config.id, handler);
        plane.element.addEventListener('click', handler);
      }
    }
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.sceneGraph.setSize(width, height);

    if (this._state === 'overview') {
      this.overviewState = calculateOverviewState(
        this.sceneGraph.getPlaneConfigs(),
        this.config.scale,
        this.config.overviewFov,
        width / height,
        this.config.overviewPadding
      );
      this.cameraController.setOverviewState(this.overviewState);
      this.cameraController.setToState(this.overviewState);
    }
  }

  private hideSceneContainer(): void {
    const el = this.refs.sceneContainer;
    el.classList.add('hidden');
    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd);
      if (el.classList.contains('hidden')) {
        el.classList.add('fully-hidden');
      }
    };
    el.addEventListener('transitionend', onEnd);
  }

  private showSceneContainer(): void {
    this.refs.sceneContainer.classList.remove('hidden', 'fully-hidden');
  }

  destroy(): void {
    this.urlSync?.destroy();
    this.urlSync = null;

    this.timeline.stop();

    for (const [planeId, handler] of this.planeClickHandlers) {
      this.sceneGraph.getZoomPlane(planeId)?.element.removeEventListener('click', handler);
    }
    this.planeClickHandlers.clear();

    if (this.refs.backButton && this.backButtonClickHandler) {
      this.refs.backButton.removeEventListener('click', this.backButtonClickHandler);
      this.backButtonClickHandler = null;
    }

    this.sceneGraph.destroy();
    window.removeEventListener('resize', this.boundHandleResize);
    window.removeEventListener('keydown', this.boundHandleKeydown);
  }
}
