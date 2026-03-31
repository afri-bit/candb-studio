import { writable, derived } from 'svelte/store';
import type { DecodedFrameDescriptor } from '../types';

/** Maximum number of frames to keep in the buffer. */
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
}

interface MonitorState {
    frames: DecodedFrameDescriptor[];
    isRunning: boolean;
    filterText: string;
    /** CAN ID → last snapshot (merged on each frame). */
    liveByMessageId: Record<number, LiveMessageSnapshot>;
}

function dataToHex(data: number[]): string {
    return data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function createMonitorStore() {
    const { subscribe, update } = writable<MonitorState>({
        frames: [],
        isRunning: false,
        filterText: '',
        liveByMessageId: {},
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
                const prev = state.liveByMessageId[id]?.signals ?? {};
                const signals: Record<string, LiveSignalEntry> = { ...prev };
                for (const s of frame.signals) {
                    signals[s.signalName] = {
                        rawValue: s.rawValue,
                        physicalValue: s.physicalValue,
                        unit: s.unit,
                    };
                }
                const liveByMessageId = {
                    ...state.liveByMessageId,
                    [id]: {
                        messageName: frame.messageName,
                        timestamp: frame.frame.timestamp,
                        dlc: frame.frame.dlc,
                        dataHex: dataToHex(frame.frame.data),
                        signals,
                    },
                };

                return { ...state, frames, liveByMessageId };
            });
        },

        clear() {
            update((state) => ({ ...state, frames: [], liveByMessageId: {} }));
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

/** Frames filtered by the current search text. */
export const filteredFrames = derived(monitorStore, ($store) => {
    if (!$store.filterText) {
        return $store.frames;
    }
    const lower = $store.filterText.toLowerCase();
    return $store.frames.filter(
        (f) =>
            f.messageName.toLowerCase().includes(lower) ||
            f.frame.id.toString(16).includes(lower) ||
            f.signals.some((s) => s.signalName.toLowerCase().includes(lower)),
    );
});
