import type { ICanBusTransmitter } from '../../core/interfaces/bus/ICanBusTransmitter';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import type { CanFrame } from '../../core/models/bus/CanFrame';
import { TransmitTask } from '../../core/models/bus/TransmitTask';
import type { EventBus } from '../../shared/events/EventBus';
import { Logger } from '../../shared/utils/Logger';

/**
 * CAN bus transmit use case.
 * Supports single-shot and periodic CAN frame transmission.
 */
export class TransmitService implements ICanBusTransmitter {
  private tasks = new Map<string, { task: TransmitTask; timer: ReturnType<typeof setInterval> }>();

  constructor(
    private readonly adapter: ICanBusAdapter,
    private readonly eventBus: EventBus,
  ) {}

  get activeTasks(): ReadonlyArray<TransmitTask> {
    return Array.from(this.tasks.values()).map((e) => e.task);
  }

  async sendOnce(frame: CanFrame): Promise<void> {
    Logger.info(`Transmit: single-shot frame ${frame.idHex}`);
    await this.adapter.send(frame);
    this.eventBus.emit('bus:frameTransmitted', frame);
  }

  startPeriodic(task: TransmitTask): void {
    if (this.tasks.has(task.id)) {
      this.stopPeriodic(task.id);
    }

    Logger.info(`Transmit: starting periodic task ${task.id} (interval=${task.intervalMs}ms)`);
    task.start();

    const timer = setInterval(async () => {
      try {
        await this.adapter.send(task.frame);
        this.eventBus.emit('bus:frameTransmitted', task.frame);
      } catch (error) {
        Logger.error(`Transmit: periodic send failed for task ${task.id}`, error);
        this.stopPeriodic(task.id);
      }
    }, task.intervalMs);

    this.tasks.set(task.id, { task, timer });
  }

  stopPeriodic(taskId: string): void {
    const entry = this.tasks.get(taskId);
    if (entry) {
      Logger.info(`Transmit: stopping periodic task ${taskId}`);
      clearInterval(entry.timer);
      entry.task.stop();
      this.tasks.delete(taskId);
    }
  }

  stopAll(): void {
    Logger.info('Transmit: stopping all periodic tasks');
    for (const [id] of this.tasks) {
      this.stopPeriodic(id);
    }
  }

  /**
   * Replace the payload of an active periodic task so the next tick (and following) use new bytes.
   * Task id matches `periodic-${messageId}` from {@link startPeriodic}.
   */
  updatePeriodicPayload(messageId: number, data: number[]): boolean {
    const taskId = `periodic-${messageId}`;
    const entry = this.tasks.get(taskId);
    if (!entry) {
      return false;
    }
    entry.task.frame.data = new Uint8Array(data);
    entry.task.frame.dlc = data.length;
    return true;
  }

  /**
   * Reschedule an active periodic task at a new interval without stopping the task or changing payload.
   */
  updatePeriodicInterval(messageId: number, intervalMs: number): boolean {
    const taskId = `periodic-${messageId}`;
    const entry = this.tasks.get(taskId);
    if (!entry) {
      return false;
    }
    const ms = Math.max(1, Math.round(intervalMs));
    Logger.info(`Transmit: rescheduling periodic task ${taskId} (interval=${ms}ms)`);
    clearInterval(entry.timer);
    entry.task.intervalMs = ms;
    const timer = setInterval(async () => {
      try {
        await this.adapter.send(entry.task.frame);
        this.eventBus.emit('bus:frameTransmitted', entry.task.frame);
      } catch (error) {
        Logger.error(`Transmit: periodic send failed for task ${taskId}`, error);
        this.stopPeriodic(taskId);
      }
    }, ms);
    entry.timer = timer;
    return true;
  }
}
