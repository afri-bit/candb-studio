import { ByteOrder } from '../../core/enums/ByteOrder';
import type { ISignalEncoder } from '../../core/interfaces/bus/ISignalEncoder';
import type { Signal } from '../../core/models/database/Signal';

/**
 * Encodes physical signal values into CAN frame byte arrays.
 * Handles both little-endian (Intel) and big-endian (Motorola) byte orders.
 */
export class SignalEncoder implements ISignalEncoder {
    encode(signal: Signal, value: number, data: Uint8Array): Uint8Array {
        const rawValue = Math.round(signal.physicalToRaw(value));
        const result = new Uint8Array(data);

        if (signal.byteOrder === ByteOrder.LittleEndian) {
            this.encodeLittleEndian(signal, rawValue, result);
        } else {
            this.encodeBigEndian(signal, rawValue, result);
        }

        return result;
    }

    private encodeLittleEndian(signal: Signal, rawValue: number, data: Uint8Array): void {
        // Intel byte order: LSB at startBit, bits increment sequentially.
        // For signals wider than 32 bits (CAN FD), use BigInt to avoid 32-bit truncation.
        if (signal.bitLength > 32) {
            let value = BigInt(rawValue);
            let bitPos = signal.startBit;
            for (let i = 0; i < signal.bitLength; i++) {
                const byteIndex = Math.floor(bitPos / 8);
                const bitIndex = bitPos % 8;
                if (byteIndex < data.length) {
                    if (value & 1n) {
                        data[byteIndex] |= 1 << bitIndex;
                    } else {
                        data[byteIndex] &= ~(1 << bitIndex);
                    }
                }
                value >>= 1n;
                bitPos++;
            }
            return;
        }

        let value = rawValue;
        let bitPos = signal.startBit;

        for (let i = 0; i < signal.bitLength; i++) {
            const byteIndex = Math.floor(bitPos / 8);
            const bitIndex = bitPos % 8;

            if (byteIndex < data.length) {
                if (value & 1) {
                    data[byteIndex] |= 1 << bitIndex;
                } else {
                    data[byteIndex] &= ~(1 << bitIndex);
                }
            }

            value >>= 1;
            bitPos++;
        }
    }

    private encodeBigEndian(signal: Signal, rawValue: number, data: Uint8Array): void {
        // Motorola (big-endian) bit packing — startBit is the MSB in DBC bit numbering.
        // Within a byte go right (decrement); at a byte boundary jump to MSB of next byte.
        // For signals wider than 32 bits (CAN FD), use BigInt to avoid 32-bit truncation.
        if (signal.bitLength > 32) {
            const raw = BigInt(rawValue);
            let bitPos = signal.startBit;
            for (let i = 0; i < signal.bitLength; i++) {
                const byteIndex = Math.floor(bitPos / 8);
                const bitIndex = bitPos % 8;
                if (byteIndex < data.length) {
                    if ((raw >> BigInt(signal.bitLength - 1 - i)) & 1n) {
                        data[byteIndex] |= 1 << bitIndex;
                    } else {
                        data[byteIndex] &= ~(1 << bitIndex);
                    }
                }
                if (bitPos % 8 === 0) {
                    bitPos += 15;
                } else {
                    bitPos -= 1;
                }
            }
            return;
        }

        let bitPos = signal.startBit;

        for (let i = 0; i < signal.bitLength; i++) {
            const byteIndex = Math.floor(bitPos / 8);
            const bitIndex = bitPos % 8;

            if (byteIndex < data.length) {
                if ((rawValue >> (signal.bitLength - 1 - i)) & 1) {
                    data[byteIndex] |= 1 << bitIndex;
                } else {
                    data[byteIndex] &= ~(1 << bitIndex);
                }
            }

            if (bitPos % 8 === 0) {
                bitPos += 15;
            } else {
                bitPos -= 1;
            }
        }
    }
}
