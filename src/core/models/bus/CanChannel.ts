import { AdapterType } from '../../enums/AdapterType';
import { CanBusState } from '../../enums/CanBusState';

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
    /**
     * Data-phase bitrate for CAN FD channels. When set and different from
     * `bitrate`, the channel operates with bit-rate switching (BRS).
     * Undefined for classic CAN channels.
     */
    public dataBitrate?: number;

    constructor(params: {
        name: string;
        bitrate?: number;
        adapterType: AdapterType;
        state?: CanBusState;
        dataBitrate?: number;
    }) {
        this.name = params.name;
        this.bitrate = params.bitrate ?? 500_000;
        this.adapterType = params.adapterType;
        this.state = params.state ?? CanBusState.Disconnected;
        this.dataBitrate = params.dataBitrate;
    }

    get isConnected(): boolean {
        return this.state === CanBusState.Connected;
    }
}
