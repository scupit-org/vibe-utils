import { HashUrlSync, type UrlSyncNavigator } from './url-hash-sync';
import type {
  NavigationEventHandler,
  NavigationEventType,
  NavigationState,
  ZoomPlaneConfig,
} from './types';

interface MockWindow {
  location: { hash: string; pathname: string; search: string };
  history: { pushState: jest.Mock };
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
}

interface MockNavigator extends UrlSyncNavigator {
  state: NavigationState;
  activePlane: string | null;
  zoomInto: jest.Mock<Promise<void>, [string]>;
  returnToOverview: jest.Mock<Promise<void>, []>;
  snapToSection: jest.Mock<void, [string]>;
  emit(event: NavigationEventType, payload?: unknown): void;
}

function makeNavigator(initialState: NavigationState = 'overview'): MockNavigator {
  const handlers = new Map<NavigationEventType, Set<NavigationEventHandler>>();

  return {
    state: initialState,
    activePlane: null,
    zoomInto: jest.fn().mockResolvedValue(undefined),
    returnToOverview: jest.fn().mockResolvedValue(undefined),
    snapToSection: jest.fn(),
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const h of set) (h as (p?: unknown) => void)(payload);
    },
  };
}

const samplePlanes: ZoomPlaneConfig[] = [
  {
    id: 'small',
    sectionId: 'page-small',
    width: 800,
    height: 600,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    element: {} as HTMLElement,
  },
  {
    id: 'middle',
    sectionId: 'page-middle',
    width: 1600,
    height: 900,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    element: {} as HTMLElement,
  },
];

describe('HashUrlSync', () => {
  let mockWindow: MockWindow;
  let originalWindow: Window | undefined;
  let hashChangeListeners: Array<() => void>;

  beforeEach(() => {
    hashChangeListeners = [];
    mockWindow = {
      location: { hash: '', pathname: '/', search: '' },
      history: { pushState: jest.fn() },
      addEventListener: jest.fn((event: string, handler: () => void) => {
        if (event === 'hashchange') hashChangeListeners.push(handler);
      }) as unknown as jest.Mock,
      removeEventListener: jest.fn((event: string, handler: () => void) => {
        if (event === 'hashchange') {
          hashChangeListeners = hashChangeListeners.filter(h => h !== handler);
        }
      }) as unknown as jest.Mock,
    };

    originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: mockWindow,
    });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: Window }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: originalWindow,
      });
    }
  });

  function fireHashChange(newHash: string): void {
    mockWindow.location.hash = newHash;
    for (const handler of hashChangeListeners) handler();
  }

  it('reconcileInitial does nothing when there is no hash', () => {
    const nav = makeNavigator('overview');
    const sync = new HashUrlSync(nav, samplePlanes);
    sync.reconcileInitial();
    expect(nav.snapToSection).not.toHaveBeenCalled();
  });

  it('reconcileInitial snaps to the matching section when hash is recognized', () => {
    mockWindow.location.hash = '#page-small';
    const nav = makeNavigator('overview');
    const sync = new HashUrlSync(nav, samplePlanes);
    sync.reconcileInitial();
    expect(nav.snapToSection).toHaveBeenCalledWith('small');
  });

  it('reconcileInitial leaves the URL alone when hash is unknown', () => {
    mockWindow.location.hash = '#not-a-real-section';
    const nav = makeNavigator('overview');
    const sync = new HashUrlSync(nav, samplePlanes);
    sync.reconcileInitial();
    expect(nav.snapToSection).not.toHaveBeenCalled();
    expect(mockWindow.history.pushState).not.toHaveBeenCalled();
  });

  it('reconcileInitial does not push a redundant URL while snapping', () => {
    mockWindow.location.hash = '#page-small';
    const nav = makeNavigator('overview');
    const sync = new HashUrlSync(nav, samplePlanes);
    sync.reconcileInitial();
    expect(mockWindow.history.pushState).not.toHaveBeenCalled();
  });

  it('hashchange to a known hash from overview triggers zoomInto', () => {
    const nav = makeNavigator('overview');
    new HashUrlSync(nav, samplePlanes);
    fireHashChange('#page-middle');
    expect(nav.zoomInto).toHaveBeenCalledWith('middle');
  });

  it('hashchange to empty from section triggers returnToOverview', () => {
    const nav = makeNavigator('section');
    nav.activePlane = 'middle';
    new HashUrlSync(nav, samplePlanes);
    fireHashChange('');
    expect(nav.returnToOverview).toHaveBeenCalled();
  });

  it('hashchange while mid-animation is ignored', () => {
    const nav = makeNavigator('zooming-in');
    new HashUrlSync(nav, samplePlanes);
    fireHashChange('#page-small');
    expect(nav.zoomInto).not.toHaveBeenCalled();
    expect(nav.returnToOverview).not.toHaveBeenCalled();
  });

  it('zoomStart event writes the section hash via pushState', () => {
    const nav = makeNavigator('overview');
    new HashUrlSync(nav, samplePlanes);
    nav.emit('zoomStart', 'small');
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, '', '/#page-small');
  });

  it('returnStart event clears the hash via pushState', () => {
    mockWindow.location.pathname = '/index.html';
    mockWindow.location.search = '?theme=dark';
    const nav = makeNavigator('section');
    new HashUrlSync(nav, samplePlanes);
    nav.emit('returnStart');
    expect(mockWindow.history.pushState).toHaveBeenCalledWith(null, '', '/index.html?theme=dark');
  });

  it('does not push when zoomStart fires while reacting to a hash change', () => {
    const nav = makeNavigator('overview');
    new HashUrlSync(nav, samplePlanes);

    nav.zoomInto.mockImplementation(async (_planeId: string) => {
      nav.emit('zoomStart', _planeId);
    });

    fireHashChange('#page-small');
    expect(nav.zoomInto).toHaveBeenCalledWith('small');
    expect(mockWindow.history.pushState).not.toHaveBeenCalled();
  });

  it('does not push when returnStart fires while reacting to a hash change', () => {
    const nav = makeNavigator('section');
    nav.activePlane = 'middle';
    new HashUrlSync(nav, samplePlanes);

    nav.returnToOverview.mockImplementation(async () => {
      nav.emit('returnStart');
    });

    fireHashChange('');
    expect(nav.returnToOverview).toHaveBeenCalled();
    expect(mockWindow.history.pushState).not.toHaveBeenCalled();
  });

  it('terminal stateChange re-runs reconcile so deferred hash changes catch up', () => {
    const nav = makeNavigator('zooming-in');
    new HashUrlSync(nav, samplePlanes);

    fireHashChange('#page-small');
    expect(nav.zoomInto).not.toHaveBeenCalled();

    nav.state = 'overview';
    nav.emit('stateChange', 'overview');
    expect(nav.zoomInto).toHaveBeenCalledWith('small');
  });

  it('hashchange to a different section while in section returns to overview first', () => {
    const nav = makeNavigator('section');
    nav.activePlane = 'middle';
    new HashUrlSync(nav, samplePlanes);
    fireHashChange('#page-small');
    expect(nav.returnToOverview).toHaveBeenCalled();
    expect(nav.zoomInto).not.toHaveBeenCalled();
  });

  it('destroy removes the hashchange listener and unsubscribes from navigator events', () => {
    const nav = makeNavigator('overview');
    const sync = new HashUrlSync(nav, samplePlanes);

    sync.destroy();

    expect(hashChangeListeners.length).toBe(0);

    nav.emit('zoomStart', 'small');
    expect(mockWindow.history.pushState).not.toHaveBeenCalled();
  });
});
