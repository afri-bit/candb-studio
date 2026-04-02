import { CanFrame } from './CanFrame';

/**
 * A scheduled CAN frame transmission task.
 *
 * Supports both single-shot and periodic transmission. Periodic tasks
 * repeat at {@link intervalMs} until explicitly stopped.
 */
export class TransmitTask {
    public id: string;
    public frame: CanFrame;
    public isPeriodic: boolean;
    public intervalMs: number;
    public isActive: boolean;

    constructor(params: {
        id: string;
        frame: CanFrame;
        isPeriodic?: boolean;
        intervalMs?: number;
        isActive?: boolean;
    }) {
        this.id = params.id;
        this.frame = params.frame;
        this.isPeriodic = params.isPeriodic ?? false;
        this.intervalMs = params.intervalMs ?? 100;
        this.isActive = params.isActive ?? false;
    }

    start(): void {
        this.isActive = true;
    }

    stop(): void {
        this.isActive = false;
    }
}
