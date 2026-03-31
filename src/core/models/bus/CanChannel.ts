import { CanBusState } from '../../enums/CanBusState';
import { AdapterType } from '../../enums/AdapterType';

/**
 * Represents a CAN bus channel / hardware interface.
 *
 * Combines the physical interface name (e.g. "can0"), the bitrate,
 * the adapter backend, and the current connection state.
 */
export class CanChannel {
  public name: string;
  public bitrate: number;
  public adapterType: AdapterType;
  public state: CanBusState;

  constructor(params: {
    name: string;
    bitrate?: number;
    adapterType: AdapterType;
    state?: CanBusState;
  }) {
    this.name = params.name;
    this.bitrate = params.bitrate ?? 500_000;
    this.adapterType = params.adapterType;
    this.state = params.state ?? CanBusState.Disconnected;
  }

  get isConnected(): boolean {
    return this.state === CanBusState.Connected;
  }
}
