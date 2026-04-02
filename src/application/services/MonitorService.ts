import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import type { ICanBusMonitor } from '../../core/interfaces/bus/ICanBusMonitor';
import type { ISignalDecoder } from '../../core/interfaces/bus/ISignalDecoder';
import type { CanFrame } from '../../core/models/bus/CanFrame';
import { DecodedMessage } from '../../core/models/bus/DecodedMessage';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import type { Disposable } from '../../core/types';
import { EventBus } from '../../shared/events/EventBus';
import type { MonitorFrameDirection } from '../../shared/events/EventTypes';
import { Logger } from '../../shared/utils/Logger';

/** Pending transmit fingerprints (FIFO) for loopback classification — ms. */
const PENDING_TX_MAX_AGE_MS = 400;

/**
 * CAN bus monitoring use case.
 * Listens for raw frames from the adapter, decodes them against the loaded
 * database, and notifies subscribers with decoded messages.
 * Frames that match a recent `bus:frameTransmitted` fingerprint are labeled **tx** (echo);
 * others are **rx**.
 */
export class MonitorService implements ICanBusMonitor {
    private _isRunning = false;
    private frameCallbacks = new Set<(frame: CanFrame) => void>();
    private adapterSubscription: Disposable | null = null;
    /** FIFO of recent transmits — matched in order when the same payload re-enters via receive. */
    private pendingTransmits: Array<{
        id: number;
        isExtended: boolean;
        data: Uint8Array;
        t: number;
    }> = [];

    constructor(
        private readonly adapter: ICanBusAdapter,
        private readonly decoder: ISignalDecoder,
        private readonly eventBus: EventBus,
        private database: CanDatabase | null = null,
    ) {
        this.eventBus.on('bus:frameTransmitted', (f) => this.recordTransmit(f));
    }

    get isRunning(): boolean {
        return this._isRunning;
    }

    /** Set or update the database used for decoding incoming frames. Pass `null` for raw-only traffic. */
    setDatabase(database: CanDatabase | null): void {
        this.database = database;
    }

    start(): void {
        if (this._isRunning) {
            return;
        }
        Logger.info('Monitor: starting');
        this._isRunning = true;
        this.adapterSubscription = this.adapter.onFrameReceived((frame) => {
            this.handleFrame(frame);
        });
    }

    stop(): void {
        if (!this._isRunning) {
            return;
        }
        Logger.info('Monitor: stopping');
        this._isRunning = false;
        this.adapterSubscription?.dispose();
        this.adapterSubscription = null;
    }

    onFrame(callback: (frame: CanFrame) => void): Disposable {
        this.frameCallbacks.add(callback);
        return { dispose: () => this.frameCallbacks.delete(callback) };
    }

    clear(): void {
        this.frameCallbacks.clear();
    }

    private recordTransmit(frame: CanFrame): void {
        this.pendingTransmits.push({
            id: frame.id,
            isExtended: frame.isExtended,
            data: new Uint8Array(frame.data),
            t: Date.now(),
        });
        if (this.pendingTransmits.length > 400) {
            this.pendingTransmits.splice(0, this.pendingTransmits.length - 400);
        }
    }

    private classifyDirection(frame: CanFrame): MonitorFrameDirection {
        const now = Date.now();
        this.pendingTransmits = this.pendingTransmits.filter(
            (p) => now - p.t < PENDING_TX_MAX_AGE_MS,
        );
        for (let i = 0; i < this.pendingTransmits.length; i++) {
            const p = this.pendingTransmits[i];
            if (p.id !== frame.id || p.isExtended !== frame.isExtended) {
                continue;
            }
            if (p.data.length !== frame.data.length) {
                continue;
            }
            let same = true;
            for (let j = 0; j < p.data.length; j++) {
                if (p.data[j] !== frame.data[j]) {
                    same = false;
                    break;
                }
            }
            if (same) {
                this.pendingTransmits.splice(i, 1);
                return 'tx';
            }
        }
        return 'rx';
    }

    private handleFrame(frame: CanFrame): void {
        for (const cb of this.frameCallbacks) {
            cb(frame);
        }

        /** Host receive time (ms since epoch). Reused frames from transmit keep a stale bus timestamp otherwise. */
        const receiveTime = Date.now();
        const direction = this.classifyDirection(frame);

        if (this.database) {
            const messageDef = this.database.findMessageById(frame.id);
            if (messageDef) {
                const signalValues = new Map<string, number>();
                for (const signal of messageDef.getResolvedSignals(
                    this.database.signalPool,
                    this.database,
                )) {
                    signalValues.set(signal.name, this.decoder.decode(signal, frame.data));
                }
                const decoded = new DecodedMessage({
                    frame,
                    message: messageDef,
                    signalPool: this.database.signalPool,
                    database: this.database,
                    signalValues,
                    timestamp: receiveTime,
                });
                this.eventBus.emit('bus:messageDecoded', { decoded, direction });
                return;
            }
        }

        this.eventBus.emit('bus:frameReceived', { frame, direction });
    }
}
