import type { CanBusState } from '../../core/enums/CanBusState';
import type { CanFrame } from '../../core/models/bus/CanFrame';
import type { DecodedMessage } from '../../core/models/bus/DecodedMessage';
import type { CanDatabase } from '../../core/models/database/CanDatabase';

/** Whether a monitor row came from our adapter receive path vs our own transmit (loopback echo). */
export type MonitorFrameDirection = 'tx' | 'rx';

/**
 * Typed event map for the internal EventBus.
 * Keys are event names; values describe the payload type for each event.
 */
export interface EventMap {
    /** Emitted after each successful adapter send (single or periodic). Used to correlate loopback with Rx. */
    'bus:frameTransmitted': CanFrame;
    'bus:frameReceived': { frame: CanFrame; direction: MonitorFrameDirection };
    'bus:messageDecoded': { decoded: DecodedMessage; direction: MonitorFrameDirection };
    'bus:stateChanged': CanBusState;
    /** Explicit DBC session used for bus decode (Monitor / Signal Lab). */
    'bus:activeDatabaseUriChanged': { uri: string | null };
    'database:loaded': { database: CanDatabase; uri: string };
    'database:changed': { database: CanDatabase; uri: string };
    'database:saved': { uri: string };
}
