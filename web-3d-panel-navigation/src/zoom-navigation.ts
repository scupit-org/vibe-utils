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
import type { RenderBackend, RenderTypes } from './render-contract';
import type {
  NavigationState, NavigationConfig, NavigationEventType,
  NavigationEventHandler, ZoomPlaneConfig, CameraState, ContainerRefs,
} from './types';
import { DEFAULT_CONFIG } from './types';

/**
 * ZoomPlaneNavigator - Main orchestrating controller for the zoom plane
 * navigation system.
 *
 * Generic over the active backend's `RenderTypes`. The backend is the second
 * constructor argument and is threaded through every subsystem so that the
 * navigator's camera, scene, and CSS3D objects are typed against (and
 * constructed from) the chosen backend's concrete classes.
 *
 * Coordinates all subsystems through a unified animation timeline:
 * - SceneGraph (3D rendering)
 * - CameraController (camera state)
 * - ClipController (page content reveal)
 * - AnimationTimeline (single rAF loop)
 */
export class ZoomPlaneNavigator<T extends RenderTypes = RenderTypes> {
  private sceneGraph: SceneGraph<T>;
  private cameraController: CameraController<T>;
  private clipController: ClipController;
  private timeline: AnimationTimeline;
  private refs: ContainerRefs;
  private backend: RenderBackend<T>;

  private _state: NavigationState = 'overview';
  private _activePlaneId: string | null = null;

  private config: NavigationConfig;
  private overviewState: CameraState<T>;
  private activeCancel: (() => void) | null = null;
  private renderFrameId: number | null = null;
  private sceneVisibilityToken = 0;

  private eventListeners = new Map<NavigationEventType, Set<NavigationEventHandler>>();
  private planeClickHandlers = new Map<string, EventListener>();
  private backButtonClickHandler: EventListener | null = null;
  private urlSync: HashUrlSync | null = null;

  private boundHandleResize: () => void;
  private boundHandleKeydown: (e: KeyboardEvent) => void;

  constructor(
    refs: ContainerRefs,
    backend: RenderBackend<T>,
    config: Partial<NavigationConfig> = {},
  ) {
    this.refs = refs;
    this.backend = backend;
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...config });

    const planeConfigs = parseAllZoomPlanes(backend, refs.planesSource, { scale: this.config.scale });

    this.clipController = new ClipController(refs.contentContainer, this.config.revealMode);
    this.validatePlaneSections(planeConfigs);

    this.sceneGraph = new SceneGraph<T>(refs.sceneContainer, planeConfigs, this.config, backend);

    this.overviewState = calculateOverviewState<T>(
      backend,
      planeConfigs,
      this.config.scale,
      this.config.overviewFov,
      window.innerWidth / window.innerHeight,
      this.config.overviewPadding
    );

    this.cameraController = new CameraController<T>(
      this.sceneGraph.camera,
      this.overviewState,
      this.config,
      backend,
    );
    this.cameraController.setToState(this.overviewState);
    this.sceneGraph.render();

    this.timeline = new AnimationTimeline();
    this.updateMotionClass();

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

    this.sceneGraph.schedulePostLoadRasterRefresh();
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
    this.overviewState = calculateOverviewState<T>(
      this.backend,
      this.sceneGraph.getPlaneConfigs(),
      this.config.scale,
      this.config.overviewFov,
      window.innerWidth / window.innerHeight,
      this.config.overviewPadding
    );
    this.cameraController.setOverviewState(this.overviewState);

    if (this._state === 'overview') {
      this.cameraController.setToState(this.overviewState);
      this.requestRender();
    }
  }

  getScene(): SceneGraph<T> {
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

  private setState(state: NavigationState): void {
    this._state = state;
    this.updateMotionClass();
  }

  private updateMotionClass(): void {
    document.documentElement.classList.toggle(
      'w3dpn-is-moving',
      this._state === 'zooming-in' || this._state === 'zooming-out'
    );
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

    this.setState('zooming-in');
    this._activePlaneId = planeId;
    this.emit('stateChange', this._state);
    this.emit('zoomStart', planeId);

    const startCameraState = this.cameraController.getCurrentState();
    const targetCameraState = this.cameraController.calculatePerpendicularState(
      planeConfig, this.sceneGraph.getScale(), this.currentAspect()
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
        calculateTransitionState(this.backend, startCameraState, targetCameraState, rawCameraT)
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

      this.sceneGraph.render();
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

    this.setState('section');
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
      planeConfig, this.sceneGraph.getScale(), this.currentAspect()
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

    this.setState('zooming-out');
    this.emit('stateChange', this._state);
    this.emit('returnStart');

    if (this.refs.backButton) {
      this.refs.backButton.classList.add('hidden');
    }

    document.body.style.overflow = 'hidden';
    this.clipController.resetScroll();

    const perpendicularState = this.cameraController.calculatePerpendicularState(
      planeConfig, this.sceneGraph.getScale(), this.currentAspect()
    );
    this.cameraController.setToState(perpendicularState);

    this.sceneGraph.setPlaneOpacity(planeId, 0);
    this.showSceneContainer();

    this.sceneGraph.render();
    const planeRect = getCenteredPlaneRect<T>(
      this.backend,
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
          calculateTransitionState(this.backend, overviewState, startCameraState, 1 - rawCameraT)
        );
      }

      this.sceneGraph.render();
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

    this.setState('zooming-out');
    this.emit('stateChange', this._state);

    const startCameraState = this.cameraController.getCurrentState();
    const overviewState = this.cameraController.getOverviewState();

    const { promise, cancel } = this.timeline.runSequence(
      this.config.cameraDuration,
      (progress) => {
        this.cameraController.setToState(
          calculateTransitionState(this.backend, overviewState, startCameraState, 1 - progress)
        );
        this.sceneGraph.render();
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

    this.setState('overview');
    this._activePlaneId = null;
    this.emit('stateChange', this._state);
    this.emit('returnComplete');
    this.requestRender();
  }

  private precomputePlaneRect(
    planeConfig: ZoomPlaneConfig,
    targetCameraState: CameraState<T>,
    restoreState: CameraState<T>
  ): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } {
    this.cameraController.setToState(targetCameraState);

    const rect = getCenteredPlaneRect<T>(
      this.backend,
      planeConfig,
      this.sceneGraph.getScale(),
      this.sceneGraph.camera,
      window.innerWidth,
      window.innerHeight
    );

    this.cameraController.setToState(restoreState);

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

  private currentAspect(): number {
    return window.innerWidth / window.innerHeight;
  }

  private requestRender(): void {
    if (this.renderFrameId !== null) {
      return;
    }

    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      this.sceneGraph.render();
    });
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.sceneGraph.setSize(width, height);

    if (this._state === 'overview') {
      this.overviewState = calculateOverviewState<T>(
        this.backend,
        this.sceneGraph.getPlaneConfigs(),
        this.config.scale,
        this.config.overviewFov,
        width / height,
        this.config.overviewPadding
      );
      this.cameraController.setOverviewState(this.overviewState);
      this.cameraController.setToState(this.overviewState);
    } else if (this._state === 'section' && this._activePlaneId) {
      const planeConfig = this.sceneGraph.getPlaneConfig(this._activePlaneId);
      if (planeConfig) {
        const perpState = this.cameraController.calculatePerpendicularState(
          planeConfig, this.sceneGraph.getScale(), width / height
        );
        this.cameraController.setToState(perpState);
      }
    }

    this.requestRender();
  }

  private hideSceneContainer(): void {
    const el = this.refs.sceneContainer;
    const token = ++this.sceneVisibilityToken;
    el.classList.add('hidden');
    el.style.pointerEvents = 'none';

    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== 'opacity') {
        return;
      }
      el.removeEventListener('transitionend', onEnd);
      if (token === this.sceneVisibilityToken && el.classList.contains('hidden')) {
        el.classList.add('fully-hidden');
      }
    };
    el.addEventListener('transitionend', onEnd);
  }

  private showSceneContainer(): void {
    this.sceneVisibilityToken++;
    this.refs.sceneContainer.classList.remove('hidden', 'fully-hidden');
    this.refs.sceneContainer.style.pointerEvents = 'auto';
    this.sceneGraph.schedulePostLoadRasterRefresh();
    this.requestRender();
  }

  destroy(): void {
    this.urlSync?.destroy();
    this.urlSync = null;

    this.timeline.stop();
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
    document.documentElement.classList.remove('w3dpn-is-moving');

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
