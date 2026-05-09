/**
 * AnimationTimeline - On-demand requestAnimationFrame driver
 *
 * Instead of multiple independent rAF loops (one for camera, one for clip),
 * this provides a single rAF loop that all animations subscribe to.
 *
 * Features:
 * - Persistent subscribers (e.g., scene rendering every frame)
 * - Timed sequences with progress callbacks and cancellation
 * - rAF loop starts only while there is work and stops again when idle
 */

/** Callback invoked every frame for persistent subscribers */
export type TickCallback = (dt: number) => void;

interface ActiveSequence {
  startTime: number; // -1 until first tick
  duration: number;
  onTick: (progress: number) => void;
  resolve: (completed: boolean) => void;
  cancelled: boolean;
  settled: boolean;
}

export class AnimationTimeline {
  private frameId: number | null = null;
  private running = false;
  private subscribers = new Map<string, TickCallback>();
  private sequences: ActiveSequence[] = [];
  private lastTime = 0;

  /**
   * Register a persistent per-frame callback.
   * Used for continuous operations like scene rendering.
   */
  subscribe(key: string, callback: TickCallback): void {
    this.subscribers.set(key, callback);
    if (this.running && this.frameId === null) {
      this.scheduleNextFrame();
    }
  }

  /**
   * Remove a persistent subscriber.
   */
  unsubscribe(key: string): void {
    this.subscribers.delete(key);
  }

  /**
   * Run a timed animation sequence.
   *
   * @param duration - Duration in milliseconds
   * @param onTick - Called every frame with progress [0, 1]. The final call
   *   is guaranteed to have progress === 1 before the promise resolves.
   * @returns Object with a promise (resolves on completion or cancellation)
   *   and a cancel function.
   */
  runSequence(
    duration: number,
    onTick: (progress: number) => void
  ): { promise: Promise<boolean>; cancel: () => void } {
    this.cancelActiveSequences();

    let resolvePromise: (completed: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });

    const sequence: ActiveSequence = {
      startTime: -1,
      duration,
      onTick,
      resolve: (completed: boolean) => resolvePromise!(completed),
      cancelled: false,
      settled: false,
    };

    this.sequences.push(sequence);
    this.start();

    return {
      promise,
      cancel: () => {
        this.cancelSequence(sequence);
      },
    };
  }

  /**
   * Start the rAF loop. Idempotent.
   */
  start(): void {
    if (this.running) return;
    if (!this.hasFrameWork()) return;
    this.running = true;
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  /**
   * Stop the rAF loop.
   */
  stop(): void {
    this.cancelActiveSequences();
    this.running = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /**
   * Check if any timed sequences are currently running.
   */
  hasActiveSequences(): boolean {
    return this.sequences.length > 0;
  }

  private tick = (): void => {
    if (!this.running) return;
    this.frameId = null;

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    // Tick all persistent subscribers
    for (const cb of this.subscribers.values()) {
      cb(dt);
    }

    // Tick active sequences
    for (let i = this.sequences.length - 1; i >= 0; i--) {
      const seq = this.sequences[i];

      if (seq.cancelled) {
        this.sequences.splice(i, 1);
        continue;
      }

      // Initialize start time on first tick
      if (seq.startTime < 0) {
        seq.startTime = now;
      }

      const elapsed = now - seq.startTime;
      const progress = Math.min(elapsed / seq.duration, 1);

      seq.onTick(progress);

      if (progress >= 1) {
        this.sequences.splice(i, 1);
        this.completeSequence(seq);
      }
    }

    if (this.hasFrameWork()) {
      this.scheduleNextFrame();
    } else {
      this.running = false;
    }
  };

  private scheduleNextFrame(): void {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(this.tick);
  }

  private hasFrameWork(): boolean {
    return this.subscribers.size > 0 || this.sequences.length > 0;
  }

  private completeSequence(sequence: ActiveSequence): void {
    if (sequence.settled) return;
    sequence.settled = true;
    sequence.resolve(true);
  }

  private cancelSequence(sequence: ActiveSequence): void {
    if (sequence.settled) return;
    sequence.cancelled = true;
    sequence.settled = true;
    this.sequences = this.sequences.filter(activeSequence => activeSequence !== sequence);
    sequence.resolve(false);
  }

  private cancelActiveSequences(): void {
    for (const sequence of this.sequences) {
      if (!sequence.settled) {
        sequence.cancelled = true;
        sequence.settled = true;
        sequence.resolve(false);
      }
    }

    this.sequences = [];
  }
}
