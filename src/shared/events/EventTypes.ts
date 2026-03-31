import type { CanFrame } from '../../core/models/bus/CanFrame';
import type { DecodedMessage } from '../../core/models/bus/DecodedMessage';
import type { CanBusState } from '../../core/enums/CanBusState';
import type { CanDatabase } from '../../core/models/database/CanDatabase';

/**
 * Typed event map for the internal EventBus.
 * Keys are event names; values describe the payload type for each event.
 */
export interface EventMap {
  'bus:frameReceived': CanFrame;
  'bus:messageDecoded': DecodedMessage;
  'bus:stateChanged': CanBusState;
  'database:loaded': { database: CanDatabase; uri: string };
  'database:changed': { database: CanDatabase; uri: string };
  'database:saved': { uri: string };
}
