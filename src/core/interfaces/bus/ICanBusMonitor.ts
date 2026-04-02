import { CanFrame } from '../../models/bus/CanFrame';
import type { Disposable } from '../../types';

/**
 * Contract for monitoring live CAN bus traffic.
 *
 * The monitor aggregates incoming frames and notifies observers.
 * It can be started and stopped independently of the underlying adapter.
 */
export interface ICanBusMonitor {
    /** Whether the monitor is currently capturing frames. */
    readonly isRunning: boolean;

    /** Start capturing frames from the connected adapter. */
    start(): void;

    /** Stop capturing frames (adapter stays connected). */
    stop(): void;

    /** Register a callback invoked for each incoming frame. Returns a disposable to unsubscribe. */
    onFrame(callback: (frame: CanFrame) => void): Disposable;

    /** Clear all buffered/displayed frame data. */
    clear(): void;
}
