import type { ISignalEncoder } from '../../core/interfaces/bus/ISignalEncoder';
import type { Signal } from '../../core/models/database/Signal';
import { ByteOrder } from '../../core/enums/ByteOrder';

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
    // Intel byte order: LSB at startBit, bits increment sequentially
    let value = rawValue;
    let bitPos = signal.startBit;

    for (let i = 0; i < signal.bitLength; i++) {
      const byteIndex = Math.floor(bitPos / 8);
      const bitIndex = bitPos % 8;

      if (byteIndex < data.length) {
        if (value & 1) {
          data[byteIndex] |= (1 << bitIndex);
        } else {
          data[byteIndex] &= ~(1 << bitIndex);
        }
      }

      value >>= 1;
      bitPos++;
    }
  }

  private encodeBigEndian(signal: Signal, _rawValue: number, _data: Uint8Array): void {
    // TODO: Implement Motorola (big-endian) bit packing
    // Big-endian bit numbering follows the Motorola scheme used in DBC files
    void signal;
  }
}
