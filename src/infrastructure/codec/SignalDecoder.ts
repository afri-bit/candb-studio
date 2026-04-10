import { ByteOrder } from '../../core/enums/ByteOrder';
import type { ISignalDecoder } from '../../core/interfaces/bus/ISignalDecoder';
import type { Signal } from '../../core/models/database/Signal';

/**
 * Decodes CAN frame byte arrays into physical signal values.
 * Handles both little-endian (Intel) and big-endian (Motorola) byte orders,
 * applies the signal's factor and offset, and handles signed values.
 */
export class SignalDecoder implements ISignalDecoder {
    decode(signal: Signal, data: Uint8Array): number {
        let rawValue: number;

        if (signal.byteOrder === ByteOrder.LittleEndian) {
            rawValue = this.decodeLittleEndian(signal, data);
        } else {
            rawValue = this.decodeBigEndian(signal, data);
        }

        // Apply sign extension for signed signals
        const isSigned = signal.valueType === 1; // SignalValueType.Signed
        if (isSigned) {
            rawValue = this.toSigned(rawValue, signal.bitLength);
        }

        return signal.rawToPhysical(rawValue);
    }

    private decodeLittleEndian(signal: Signal, data: Uint8Array): number {
        let value = 0;
        let bitPos = signal.startBit;

        for (let i = 0; i < signal.bitLength; i++) {
            const byteIndex = Math.floor(bitPos / 8);
            const bitIndex = bitPos % 8;

            if (byteIndex < data.length && data[byteIndex] & (1 << bitIndex)) {
                value |= 1 << i;
            }

            bitPos++;
        }

        return value;
    }

    private decodeBigEndian(signal: Signal, data: Uint8Array): number {
        let value = 0;
        let bitPos = signal.startBit;

        for (let i = 0; i < signal.bitLength; i++) {
            const byteIndex = Math.floor(bitPos / 8);
            const bitIndex = bitPos % 8;

            if (byteIndex < data.length && (data[byteIndex] & (1 << bitIndex))) {
                value |= 1 << (signal.bitLength - 1 - i); // MSB first
            }

            // Advance to next bit in Motorola order:
            // within a byte go right (decrement); at byte boundary jump to MSB of next byte
            if (bitPos % 8 === 0) {
                bitPos += 15;
            } else {
                bitPos -= 1;
            }
        }

        return value;
    }

    private toSigned(value: number, bitLength: number): number {
        const signBit = 1 << (bitLength - 1);
        if (value & signBit) {
            return value - (1 << bitLength);
        }
        return value;
    }
}
