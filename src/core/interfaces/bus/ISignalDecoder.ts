import { Signal } from '../../models/database/Signal';

/**
 * Decodes the raw bytes of a CAN frame into a physical signal value.
 *
 * The decoder extracts bits at the signal's start position and length,
 * respects byte order, and applies the linear conversion
 * (physical = raw × factor + offset).
 */
export interface ISignalDecoder {
    /** Decode the physical value of `signal` from the given frame data bytes. */
    decode(signal: Signal, data: Uint8Array): number;
}
