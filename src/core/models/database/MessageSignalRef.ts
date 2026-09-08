import { MultiplexIndicator } from '../../enums/MultiplexIndicator';
import { ByteOrder } from '../../enums/ByteOrder';

/**
 * Per-message placement of a signal that is defined in the global {@link CanDatabase.signalPool}.
 * Definition (factor, unit, …) lives in the pool; this is only frame layout.
 */
export interface MessageSignalRef {
    signalName: string;
    /** Multiplex role belongs to this frame, independently of the pool definition. */
    multiplexIndicator?: MultiplexIndicator;
    multiplexValue?: number;
    startBit: number;
    bitLength: number;
    byteOrder: ByteOrder;
}
