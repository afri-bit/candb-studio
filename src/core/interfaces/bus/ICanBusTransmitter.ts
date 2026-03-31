import { CanFrame } from '../../models/bus/CanFrame';
import { TransmitTask } from '../../models/bus/TransmitTask';

/**
 * Contract for transmitting CAN frames.
 *
 * Supports both single-shot sends and periodic (cyclic) transmission
 * tasks that repeat at a configured interval.
 */
export interface ICanBusTransmitter {
  /** Send a single frame immediately. */
  sendOnce(frame: CanFrame): Promise<void>;

  /** Start a periodic transmit task. */
  startPeriodic(task: TransmitTask): void;

  /** Stop a specific periodic transmit task by ID. */
  stopPeriodic(taskId: string): void;

  /** Stop all active periodic transmit tasks. */
  stopAll(): void;

  /** Currently active periodic tasks. */
  readonly activeTasks: ReadonlyArray<TransmitTask>;
}
