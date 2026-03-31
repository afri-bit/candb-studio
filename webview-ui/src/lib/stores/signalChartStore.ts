import { get, writable } from 'svelte/store';
import type { DecodedFrameDescriptor } from '../types';

/** Max points per series (ring buffer capacity). */
export const MAX_CHART_POINTS = 3000;

export function seriesKey(frameId: number, signalName: string): string {
    return `${frameId}:${signalName}`;
}

type RingBuffer = {
    cap: number;
    t: Float64Array;
    v: Float64Array;
    count: number;
    head: number;
};

function createBuffer(cap: number): RingBuffer {
    return { cap, t: new Float64Array(cap), v: new Float64Array(cap), count: 0, head: 0 };
}

function appendRing(b: RingBuffer, t: number, v: number): void {
    if (b.count < b.cap) {
        b.t[b.count] = t;
        b.v[b.count] = v;
        b.count++;
    } else {
        b.t[b.head] = t;
        b.v[b.head] = v;
        b.head = (b.head + 1) % b.cap;
    }
}

function getRingXY(b: RingBuffer): [number[], number[]] {
    if (b.count === 0) {
        return [[], []];
    }
    if (b.count < b.cap) {
        return [Array.from(b.t.subarray(0, b.count)), Array.from(b.v.subarray(0, b.count))];
    }
    const x: number[] = new Array(b.cap);
    const y: number[] = new Array(b.cap);
    for (let i = 0; i < b.cap; i++) {
        const idx = (b.head + i) % b.cap;
        x[i] = b.t[idx];
        y[i] = b.v[idx];
    }
    return [x, y];
}

function createSignalChartStore() {
    const buffers = new Map<string, RingBuffer>();
    const selectedKeys = writable<Set<string>>(new Set());
    const ingestPaused = writable(false);
    const chartRevision = writable(0);

    function bump(): void {
        chartRevision.update((n) => n + 1);
    }

    return {
        selectedKeys,
        ingestPaused,
        chartRevision,

        setIngestPaused(paused: boolean): void {
            ingestPaused.set(paused);
        },

        setSelectedKeys(keys: Set<string>): void {
            const prev = get(selectedKeys);
            for (const k of prev) {
                if (!keys.has(k)) {
                    buffers.delete(k);
                }
            }
            selectedKeys.set(keys);
            bump();
        },

        appendFromFrame(frame: DecodedFrameDescriptor): void {
            if (get(ingestPaused)) {
                return;
            }
            const sel = get(selectedKeys);
            if (sel.size === 0) {
                return;
            }
            const id = frame.frame.id;
            const tsMs = frame.frame.timestamp;
            let changed = false;
            for (const s of frame.signals) {
                const key = seriesKey(id, s.signalName);
                if (!sel.has(key)) {
                    continue;
                }
                let buf = buffers.get(key);
                if (!buf) {
                    buf = createBuffer(MAX_CHART_POINTS);
                    buffers.set(key, buf);
                }
                appendRing(buf, tsMs, s.physicalValue);
                changed = true;
            }
            if (changed) {
                bump();
            }
        },

        clear(): void {
            buffers.clear();
            bump();
        },

        /** X values in Unix ms (same as `frame.timestamp`); Y values are physical. */
        getSeriesData(key: string): [number[], number[]] {
            const b = buffers.get(key);
            if (!b) {
                return [[], []];
            }
            return getRingXY(b);
        },
    };
}

export const signalChartStore = createSignalChartStore();

/** For Svelte `$store` reactivity. */
export const signalChartSelectedKeys = signalChartStore.selectedKeys;
export const signalChartRevision = signalChartStore.chartRevision;
export const signalChartIngestPaused = signalChartStore.ingestPaused;
