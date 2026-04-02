import type { EventMap } from './EventTypes';

type EventCallback<T> = (payload: T) => void;

/**
 * Typed publish/subscribe event bus for decoupled communication
 * between layers (infrastructure → application → presentation).
 */
export class EventBus {
    private listeners = new Map<string, Set<EventCallback<unknown>>>();

    /** Subscribe to a typed event. Returns an unsubscribe function. */
    on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        const set = this.listeners.get(event)!;
        set.add(callback as EventCallback<unknown>);
        return () => set.delete(callback as EventCallback<unknown>);
    }

    /** Emit a typed event to all subscribers. */
    emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
        const set = this.listeners.get(event);
        if (set) {
            for (const cb of set) {
                cb(payload);
            }
        }
    }

    /** Remove all listeners for a specific event, or all events if omitted. */
    clear(event?: keyof EventMap): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}
