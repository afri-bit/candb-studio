import { Signal } from '../../models/database/Signal';

/**
 * Encodes a physical signal value into the raw bytes of a CAN frame.
 *
 * The encoder applies the inverse of the signal's linear conversion
 * (raw = (physical − offset) / factor), then packs the result at the
 * correct bit position and byte order.
 */
export interface ISignalEncoder {
    /**
     * Encode a physical value for `signal` into `data`, returning the
     * modified buffer. The caller provides the existing frame data so
     * multiple signals can be packed into the same buffer.
     */
    encode(signal: Signal, value: number, data: Uint8Array): Uint8Array;
}
