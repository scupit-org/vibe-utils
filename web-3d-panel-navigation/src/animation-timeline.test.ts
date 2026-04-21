import { AnimationTimeline, type TickCallback } from './animation-timeline';

describe('AnimationTimeline', () => {
  let originalRequestAnimationFrame: typeof requestAnimationFrame | undefined;
  let originalCancelAnimationFrame: typeof cancelAnimationFrame | undefined;
  let originalPerformance: Performance;
  let frameCallbacks: TickCallback[];
  let now: number;

  beforeEach(() => {
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    originalPerformance = globalThis.performance;
    frameCallbacks = [];
    now = 0;

    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { now: () => now },
    });

    globalThis.requestAnimationFrame = ((callback: TickCallback): number => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    }) as unknown as typeof requestAnimationFrame;

    globalThis.cancelAnimationFrame = jest.fn() as unknown as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance,
    });

    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      delete (globalThis as typeof globalThis & { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
    }

    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    } else {
      delete (globalThis as typeof globalThis & { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame;
    }
  });

  function runNextFrame(ms: number): void {
    const callback = frameCallbacks.shift();
    if (!callback) {
      throw new Error('Expected a scheduled animation frame');
    }

    now += ms;
    callback(ms);
  }

  it('cancels the previous timed sequence when a new sequence starts', async () => {
    const timeline = new AnimationTimeline();
    const first = timeline.runSequence(100, jest.fn());
    const second = timeline.runSequence(100, jest.fn());

    await expect(first.promise).resolves.toBe(false);
    expect(timeline.hasActiveSequences()).toBe(true);

    second.cancel();

    await expect(second.promise).resolves.toBe(false);
    expect(timeline.hasActiveSequences()).toBe(false);
  });

  it('resolves a sequence as completed after the final frame', async () => {
    const timeline = new AnimationTimeline();
    const onTick = jest.fn();

    timeline.start();
    const sequence = timeline.runSequence(100, onTick);

    runNextFrame(0);
    runNextFrame(100);

    await expect(sequence.promise).resolves.toBe(true);
    expect(onTick).toHaveBeenLastCalledWith(1);
    expect(timeline.hasActiveSequences()).toBe(false);

    timeline.stop();
  });

  it('cancels active sequences on stop', async () => {
    const timeline = new AnimationTimeline();
    const sequence = timeline.runSequence(100, jest.fn());

    timeline.stop();

    await expect(sequence.promise).resolves.toBe(false);
    expect(timeline.hasActiveSequences()).toBe(false);
  });
});
