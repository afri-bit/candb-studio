import { CanFrame } from '../../models/bus/CanFrame';
import { CanChannel } from '../../models/bus/CanChannel';
import { CanBusState } from '../../enums/CanBusState';
import type { Disposable } from '../../types';

/**
 * Hardware abstraction layer for a CAN bus adapter.
 *
 * Each physical backend (SocketCAN, SLCAN, PCAN, Virtual, etc.) implements
 * this interface. The adapter manages the connection lifecycle and provides
 * event-driven frame reception.
 */
export interface ICanBusAdapter {
  /** Current connection state. */
  readonly state: CanBusState;

  /** Open a connection to the specified CAN channel. */
  connect(channel: CanChannel): Promise<void>;

  /** Close the active connection and release resources. */
  disconnect(): Promise<void>;

  /** Transmit a single CAN frame. Rejects if not connected. */
  send(frame: CanFrame): Promise<void>;

  /** Register a callback invoked for every received CAN frame. */
  onFrameReceived(callback: (frame: CanFrame) => void): Disposable;

  /** Register a callback invoked whenever the connection state changes. */
  onStateChanged(callback: (state: CanBusState) => void): Disposable;

  /** Register a callback for adapter-level errors. */
  onError(callback: (error: Error) => void): Disposable;
}
