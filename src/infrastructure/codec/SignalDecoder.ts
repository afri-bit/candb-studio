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
        // For signals wider than 32 bits (possible in CAN FD), use BigInt accumulation
        // to avoid silent truncation from JS 32-bit bitwise operators.
        // Note: signals wider than 53 bits may lose precision when converted to Number
        // (IEEE 754 double has a 53-bit mantissa); this is acceptable for automotive use.
        if (signal.bitLength > 32) {
            let value = 0n;
            let bitPos = signal.startBit;
            for (let i = 0; i < signal.bitLength; i++) {
                const byteIndex = Math.floor(bitPos / 8);
                const bitIndex = bitPos % 8;
                if (byteIndex < data.length && data[byteIndex] & (1 << bitIndex)) {
                    value |= 1n << BigInt(i);
                }
                bitPos++;
            }
            return Number(value);
        }

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
        // For signals wider than 32 bits (possible in CAN FD), use BigInt accumulation.
        if (signal.bitLength > 32) {
            let value = 0n;
            let bitPos = signal.startBit;
            for (let i = 0; i < signal.bitLength; i++) {
                const byteIndex = Math.floor(bitPos / 8);
                const bitIndex = bitPos % 8;
                if (byteIndex < data.length && data[byteIndex] & (1 << bitIndex)) {
                    value |= 1n << BigInt(signal.bitLength - 1 - i);
                }
                if (bitPos % 8 === 0) {
                    bitPos += 15;
                } else {
                    bitPos -= 1;
                }
            }
            return Number(value);
        }

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
        if (bitLength > 32) {
            // BigInt sign extension for wide signals
            const raw = BigInt(value);
            const signBit = 1n << BigInt(bitLength - 1);
            if (raw & signBit) {
                return Number(raw - (1n << BigInt(bitLength)));
            }
            return value;
        }
        const signBit = 1 << (bitLength - 1);
        if (value & signBit) {
            return value - (1 << bitLength);
        }
        return value;
    }
}
