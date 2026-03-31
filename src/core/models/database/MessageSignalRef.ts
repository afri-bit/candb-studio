import { ByteOrder } from '../../enums/ByteOrder';

/**
 * Per-message placement of a signal that is defined in the global {@link CanDatabase.signalPool}.
 * Definition (factor, unit, …) lives in the pool; this is only frame layout.
 */
export interface MessageSignalRef {
  signalName: string;
  startBit: number;
  bitLength: number;
  byteOrder: ByteOrder;
}
