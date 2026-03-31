import { writable, derived } from 'svelte/store';
import type { DecodedFrameDescriptor } from '../types';

/** Maximum number of frames to keep in the buffer. */
const MAX_FRAME_BUFFER = 2000;

interface MonitorState {
    frames: DecodedFrameDescriptor[];
    isRunning: boolean;
    filterText: string;
}

function createMonitorStore() {
    const { subscribe, update } = writable<MonitorState>({
        frames: [],
        isRunning: false,
        filterText: '',
    });

    return {
        subscribe,

        addFrame(frame: DecodedFrameDescriptor) {
            update((state) => {
                const frames = [...state.frames, frame];
                if (frames.length > MAX_FRAME_BUFFER) {
                    frames.splice(0, frames.length - MAX_FRAME_BUFFER);
                }
                return { ...state, frames };
            });
        },

        clear() {
            update((state) => ({ ...state, frames: [] }));
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
