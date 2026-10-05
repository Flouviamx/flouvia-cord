// Store observable mínimo. Es la pieza que permite que el mismo estado alimente
// a React (useSyncExternalStore), Vue (shallowRef), un Web Component o tu propia UI.

export interface ReadableStore<T> {
    get(): T;
    subscribe(listener: (state: T) => void): () => void;
}

export interface Store<T> extends ReadableStore<T> {
    set(next: T | ((prev: T) => T)): void;
}

export function createStore<T>(initial: T): Store<T> {
    let state = initial;
    const listeners = new Set<(state: T) => void>();
    return {
        get: () => state,
        set(next) {
            const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
            if (Object.is(value, state)) return;
            state = value;
            for (const l of [...listeners]) l(state);
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
    };
}
