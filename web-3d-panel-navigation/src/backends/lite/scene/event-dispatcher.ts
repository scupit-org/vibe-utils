export interface SceneEvent {
  type: string;
  [key: string]: unknown;
}

export type SceneEventListener = (event: SceneEvent) => void;

/**
 * Minimal event dispatcher mirroring three's EventDispatcher API surface that
 * Object3D / CSS3DObject actually use (`addEventListener`, `removeEventListener`,
 * `dispatchEvent`).
 */
export class EventDispatcher {
  private _listeners: Map<string, Set<SceneEventListener>> | undefined;

  addEventListener(type: string, listener: SceneEventListener): void {
    if (!this._listeners) this._listeners = new Map();
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: SceneEventListener): void {
    const set = this._listeners?.get(type);
    if (set) set.delete(listener);
  }

  dispatchEvent(event: SceneEvent): void {
    const set = this._listeners?.get(event.type);
    if (!set) return;
    for (const listener of Array.from(set)) {
      listener(event);
    }
  }
}
