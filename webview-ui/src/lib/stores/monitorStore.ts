import { derived, writable } from 'svelte/store';
import type { DecodedFrameDescriptor } from '../types';

/** Maximum number of frames to keep in the buffer (Rx + Tx combined). */
const MAX_FRAME_BUFFER = 2000;

/** Latest decoded values per CAN ID (for static message view). */
export interface LiveSignalEntry {
  rawValue: number;
  physicalValue: number;
  unit: string;
}

export interface LiveMessageSnapshot {
  messageName: string;
  timestamp: number;
  dlc: number;
  dataHex: string;
  signals: Record<string, LiveSignalEntry>;
  /** Standard (11-bit) vs extended (29-bit) CAN ID. */
  isExtended: boolean;
  /** True when this frame was transmitted as a CAN FD frame. */
  isFd?: boolean;
}

/** Newer of Rx vs Tx snapshot for the same ID (for a single “current values” table). */
export type LiveMessageSnapshotWithDirection = LiveMessageSnapshot & {
  lastDirection: 'rx' | 'tx';
};

export function mergeLiveSnapshots(
  rx: LiveMessageSnapshot | undefined,
  tx: LiveMessageSnapshot | undefined,
): LiveMessageSnapshotWithDirection | undefined {
  if (!rx && !tx) {
    return undefined;
  }
  if (!tx) {
    return { ...rx!, lastDirection: 'rx' };
  }
  if (!rx) {
    return { ...tx, lastDirection: 'tx' };
  }
  return rx.timestamp >= tx.timestamp
    ? { ...rx, lastDirection: 'rx' }
    : { ...tx, lastDirection: 'tx' };
}

interface MonitorState {
  frames: DecodedFrameDescriptor[];
  isRunning: boolean;
  filterText: string;
  /** CAN ID → last snapshot for received (bus) traffic. */
  liveRxByMessageId: Record<number, LiveMessageSnapshot>;
  /** CAN ID → last snapshot for transmit echo / loopback. */
  liveTxByMessageId: Record<number, LiveMessageSnapshot>;
}

function dataToHex(data: number[]): string {
  return data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function applyFilter(frames: DecodedFrameDescriptor[], lower: string): DecodedFrameDescriptor[] {
  if (!lower) {
    return frames;
  }
  return frames.filter(
    (f) =>
      f.messageName.toLowerCase().includes(lower) ||
      f.frame.id.toString(16).includes(lower) ||
      f.signals.some((s) => s.signalName.toLowerCase().includes(lower)),
  );
}

function createMonitorStore() {
  const { subscribe, update } = writable<MonitorState>({
    frames: [],
    isRunning: false,
    filterText: '',
    liveRxByMessageId: {},
    liveTxByMessageId: {},
  });

  return {
    subscribe,

    addFrame(frame: DecodedFrameDescriptor) {
      update((state) => {
        const frames = [...state.frames, frame];
        if (frames.length > MAX_FRAME_BUFFER) {
          frames.splice(0, frames.length - MAX_FRAME_BUFFER);
        }

        const id = frame.frame.id;
        const liveKey = frame.direction === 'tx' ? 'liveTxByMessageId' : 'liveRxByMessageId';
        const prev = state[liveKey][id]?.signals ?? {};
        const signals: Record<string, LiveSignalEntry> = { ...prev };
        for (const s of frame.signals) {
          signals[s.signalName] = {
            rawValue: s.rawValue,
            physicalValue: s.physicalValue,
            unit: s.unit,
          };
        }
        const snapshot: LiveMessageSnapshot = {
          messageName: frame.messageName,
          timestamp: frame.frame.timestamp,
          dlc: frame.frame.dlc,
          dataHex: dataToHex(frame.frame.data),
          signals,
          isExtended: frame.frame.isExtended,
          isFd: frame.frame.isFd,
        };

        return {
          ...state,
          frames,
          [liveKey]: {
            ...state[liveKey],
            [id]: snapshot,
          },
        };
      });
    },

    clear() {
      update((state) => ({
        ...state,
        frames: [],
        liveRxByMessageId: {},
        liveTxByMessageId: {},
      }));
    },

    setRunning(running: boolean) {
      update((state) => ({ ...state, isRunning: running }));
    },

    setFilter(text: string) {
      update((state) => ({ ...state, filterText: text }));
    },
  };
}

export const monitorStore = createMonitorStore();

function filterFrames($store: MonitorState): DecodedFrameDescriptor[] {
  const lower = $store.filterText.toLowerCase();
  return applyFilter($store.frames, lower);
}

/** All frames matching the filter (Rx + Tx). */
export const filteredFrames = derived(monitorStore, filterFrames);

export const filteredRxFrames = derived(monitorStore, ($store) => {
  const lower = $store.filterText.toLowerCase();
  return applyFilter(
    $store.frames.filter((f) => f.direction === 'rx'),
    lower,
  );
});

export const filteredTxFrames = derived(monitorStore, ($store) => {
  const lower = $store.filterText.toLowerCase();
  return applyFilter(
    $store.frames.filter((f) => f.direction === 'tx'),
    lower,
  );
});

/** Per CAN ID: latest snapshot whether traffic was classified Rx or Tx (transmit echo). */
export const liveLatestByMessageId = derived(monitorStore, ($store) => {
  const out: Record<number, LiveMessageSnapshotWithDirection> = {};
  const ids = new Set<number>();
  for (const k of Object.keys($store.liveRxByMessageId)) {
    ids.add(Number(k));
  }
  for (const k of Object.keys($store.liveTxByMessageId)) {
    ids.add(Number(k));
  }
  for (const id of ids) {
    const merged = mergeLiveSnapshots(
      $store.liveRxByMessageId[id],
      $store.liveTxByMessageId[id],
    );
    if (merged) {
      out[id] = merged;
    }
  }
  return out;
});
