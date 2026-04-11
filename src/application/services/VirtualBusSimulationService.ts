import { CanBusState } from '../../core/enums/CanBusState';
import type { CanFrame } from '../../core/models/bus/CanFrame';
import { CanFrame as CanFrameCtor } from '../../core/models/bus/CanFrame';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import { VirtualCanAdapter } from '../../infrastructure/adapters/VirtualCanAdapter';
import { Logger } from '../../shared/utils/Logger';
import type { EventBus } from '../../shared/events/EventBus';
import { validateDbcAlignedInjection } from './virtualBusInjectionValidation';

export type VirtualBusSessionState = 'idle' | 'running' | 'stopped';

/** v1 caps — see specs/010-virtual-can-bus-sim/research.md */
export const VIRTUAL_BUS_MIN_PERIODIC_INTERVAL_MS = 10;
export const VIRTUAL_BUS_MAX_CONCURRENT_PERIODIC = 32;

export type VirtualInjectionResult = { ok: true } | { ok: false; message: string; code?: string };

/**
 * Software-only virtual CAN session: DBC-aligned injection into the monitor receive path
 * (via {@link VirtualCanAdapter#injectFrameForMonitor}).
 *
 * Emits `bus:frameTransmitted` before each inject so {@link MonitorService} classifies these
 * frames as **Tx** in the Signal Lab log (same as hardware loopback).
 */
export class VirtualBusSimulationService {
    private sessionState: VirtualBusSessionState = 'idle';
    private adapter: VirtualCanAdapter | null = null;
    private readonly periodicTasks = new Map<
        string,
        {
            timer: ReturnType<typeof setInterval>;
            messageId: number;
            data: Uint8Array;
            intervalMs: number;
        }
    >();

    constructor(
        private readonly getDatabaseForBus: () => CanDatabase | null,
        private readonly eventBus: EventBus,
    ) {}

    setSimulationAdapter(adapter: VirtualCanAdapter | null): void {
        this.adapter = adapter;
    }

    getSimulationAdapter(): VirtualCanAdapter | null {
        return this.adapter;
    }

    getSessionState(): VirtualBusSessionState {
        return this.sessionState;
    }

    isRunning(): boolean {
        return this.sessionState === 'running';
    }

    /** Clear timers and session flags (adapter cleared by host on disconnect). */
    resetSession(): void {
        this.clearPeriodic();
        this.sessionState = 'idle';
    }

    start(): VirtualInjectionResult {
        if (!this.adapter || this.adapter.state !== CanBusState.Connected) {
            return { ok: false, message: 'Virtual adapter is not connected.', code: 'NO_ADAPTER' };
        }
        if (this.sessionState === 'running') {
            return { ok: true };
        }
        this.sessionState = 'running';
        Logger.info('VirtualBusSimulation: session running');
        return { ok: true };
    }

    stop(): void {
        this.clearPeriodic();
        if (this.sessionState === 'running') {
            this.sessionState = 'stopped';
            Logger.info('VirtualBusSimulation: session stopped');
        }
    }

    injectDbcAligned(canId: number, data: Uint8Array, isExtended = false): VirtualInjectionResult {
        const database = this.getDatabaseForBus();
        const v = validateDbcAlignedInjection(canId, data, database);
        if (!v.ok) {
            return { ok: false, message: v.message, code: v.code };
        }
        if (!this.adapter || this.adapter.state !== CanBusState.Connected) {
            return { ok: false, message: 'Virtual adapter is not connected.', code: 'NO_ADAPTER' };
        }
        const msgDef = database?.findMessageById(canId);
        const frame: CanFrame = new CanFrameCtor({
            id: canId,
            data: new Uint8Array(data),
            dlc: data.length,
            isExtended,
            timestamp: Date.now(),
            isFd: msgDef?.isFd ?? false,
        });
        this.eventBus.emit('bus:frameTransmitted', frame);
        this.adapter.injectFrameForMonitor(frame);
        return { ok: true };
    }

    startPeriodic(canId: number, data: Uint8Array, intervalMs: number): VirtualInjectionResult {
        const database = this.getDatabaseForBus();
        const v = validateDbcAlignedInjection(canId, data, database);
        if (!v.ok) {
            return { ok: false, message: v.message, code: v.code };
        }
        if (!this.adapter || this.adapter.state !== CanBusState.Connected) {
            return { ok: false, message: 'Virtual adapter is not connected.', code: 'NO_ADAPTER' };
        }
        if (this.periodicTasks.size >= VIRTUAL_BUS_MAX_CONCURRENT_PERIODIC) {
            return {
                ok: false,
                message: `At most ${VIRTUAL_BUS_MAX_CONCURRENT_PERIODIC} concurrent periodic tasks.`,
                code: 'PERIODIC_LIMIT',
            };
        }
        const ms = Math.max(VIRTUAL_BUS_MIN_PERIODIC_INTERVAL_MS, Math.round(intervalMs));
        const taskId = `periodic-${canId}`;
        this.stopPeriodic(canId);
        const payload = new Uint8Array(data);
        const timer = setInterval(() => {
            const entry = this.periodicTasks.get(taskId);
            if (!entry) {
                return;
            }
            const db = this.getDatabaseForBus();
            const check = validateDbcAlignedInjection(canId, entry.data, db);
            if (!check.ok) {
                Logger.warn(`VirtualBusSimulation: periodic inject skipped: ${check.message}`);
                return;
            }
            this.injectDbcAligned(canId, entry.data, false);
        }, ms);
        this.periodicTasks.set(taskId, { timer, messageId: canId, data: payload, intervalMs: ms });
        return { ok: true };
    }

    stopPeriodic(canId: number): void {
        const taskId = `periodic-${canId}`;
        const entry = this.periodicTasks.get(taskId);
        if (entry) {
            clearInterval(entry.timer);
            this.periodicTasks.delete(taskId);
        }
    }

    updatePeriodicPayload(canId: number, data: number[]): boolean {
        const taskId = `periodic-${canId}`;
        const entry = this.periodicTasks.get(taskId);
        if (!entry) {
            return false;
        }
        const database = this.getDatabaseForBus();
        const v = validateDbcAlignedInjection(canId, new Uint8Array(data), database);
        if (!v.ok) {
            return false;
        }
        entry.data = new Uint8Array(data);
        return true;
    }

    updatePeriodicInterval(canId: number, intervalMs: number): boolean {
        const taskId = `periodic-${canId}`;
        const entry = this.periodicTasks.get(taskId);
        if (!entry) {
            return false;
        }
        clearInterval(entry.timer);
        const ms = Math.max(VIRTUAL_BUS_MIN_PERIODIC_INTERVAL_MS, Math.round(intervalMs));
        entry.intervalMs = ms;
        entry.timer = setInterval(() => {
            const db = this.getDatabaseForBus();
            const check = validateDbcAlignedInjection(canId, entry.data, db);
            if (!check.ok) {
                return;
            }
            this.injectDbcAligned(canId, entry.data, false);
        }, ms);
        return true;
    }

    getPeriodicIntervals(): Record<number, number> {
        const out: Record<number, number> = {};
        for (const [, e] of this.periodicTasks) {
            out[e.messageId] = e.intervalMs;
        }
        return out;
    }

    private clearPeriodic(): void {
        for (const [, e] of this.periodicTasks) {
            clearInterval(e.timer);
        }
        this.periodicTasks.clear();
    }
}
