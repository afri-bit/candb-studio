import type { ICanBusMonitor } from '../../core/interfaces/bus/ICanBusMonitor';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import type { ISignalDecoder } from '../../core/interfaces/bus/ISignalDecoder';
import type { CanFrame } from '../../core/models/bus/CanFrame';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import type { Disposable } from '../../core/types';
import { DecodedMessage } from '../../core/models/bus/DecodedMessage';
import { EventBus } from '../../shared/events/EventBus';
import { Logger } from '../../shared/utils/Logger';

/**
 * CAN bus monitoring use case.
 * Listens for raw frames from the adapter, decodes them against the loaded
 * database, and notifies subscribers with decoded messages.
 */
export class MonitorService implements ICanBusMonitor {
  private _isRunning = false;
  private frameCallbacks = new Set<(frame: CanFrame) => void>();
  private adapterSubscription: Disposable | null = null;

  constructor(
    private readonly adapter: ICanBusAdapter,
    private readonly decoder: ISignalDecoder,
    private readonly eventBus: EventBus,
    private database: CanDatabase | null = null,
  ) {}

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Set or update the database used for decoding incoming frames. */
  setDatabase(database: CanDatabase): void {
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

  private handleFrame(frame: CanFrame): void {
    this.eventBus.emit('bus:frameReceived', frame);

    for (const cb of this.frameCallbacks) {
      cb(frame);
    }

    if (this.database) {
      const messageDef = this.database.findMessageById(frame.id);
      if (messageDef) {
        const signalValues = new Map<string, number>();
        for (const signal of messageDef.getResolvedSignals(this.database.signalPool, this.database)) {
          signalValues.set(signal.name, this.decoder.decode(signal, frame.data));
        }
        const decoded = new DecodedMessage({
          frame,
          message: messageDef,
          signalPool: this.database.signalPool,
          database: this.database,
          signalValues,
          timestamp: frame.timestamp,
        });
        this.eventBus.emit('bus:messageDecoded', decoded);
      }
    }
  }
}
