import { writable } from 'svelte/store';

/**
 * Tracks which message IDs are transmitting periodically (messageId → intervalMs).
 * Lives in a store so tab switches in Signal Lab do not unmount this state while
 * {@link TransmitService} keeps tasks running in the extension.
 */
export interface TransmitPeriodicState {
  /** CAN message ID → period in ms */
  intervals: Record<number, number>;
}

function createTransmitPeriodicStore() {
  const { subscribe, update, set } = writable<TransmitPeriodicState>({ intervals: {} });

  return {
    subscribe,

    start(messageId: number, intervalMs: number) {
      update((s) => ({
        intervals: { ...s.intervals, [messageId]: intervalMs },
      }));
    },

    stop(messageId: number) {
      update((s) => {
        if (!(messageId in s.intervals)) return s;
        const next = { ...s.intervals };
        delete next[messageId];
        return { intervals: next };
      });
    },

    updateInterval(messageId: number, intervalMs: number) {
      update((s) => {
        if (!(messageId in s.intervals)) return s;
        return { intervals: { ...s.intervals, [messageId]: intervalMs } };
      });
    },

    stopAll() {
      set({ intervals: {} });
    },

    /** Replace state from extension (e.g. after reopening Signal Lab). */
    syncFromExtension(intervals: Record<number, number>) {
      set({ intervals: { ...intervals } });
    },
  };
}

export const transmitPeriodicStore = createTransmitPeriodicStore();
