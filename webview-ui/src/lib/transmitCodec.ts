/**
 * Encode/decode CAN payload bytes from DBC signal layout (Intel / Motorola).
 * Matches {@link bitLayoutUtils.getSignalLsbMsbPhysicalBits}: Intel LSB at startBit;
 * Motorola MSB at startBit, LSB at startBit + bitLength - 1.
 */
import type { SignalDescriptor } from './types';

function extractBitsIntel(startBit: number, bitLength: number, data: Uint8Array): number {
  let value = 0;
  let bitPos = startBit;
  for (let i = 0; i < bitLength; i++) {
    const byteIndex = bitPos >> 3;
    const bitIndex = bitPos & 7;
    if (byteIndex < data.length && data[byteIndex] & (1 << bitIndex)) {
      value |= 1 << i;
    }
    bitPos++;
  }
  return value;
}

/**
 * Motorola (big-endian): startBit is the MSB in DBC bit numbering
 * (byte k = bits 8k+7..8k).  Navigate MSB→LSB: decrement within a byte,
 * jump to the MSB of the next byte (+15) when crossing a byte boundary.
 * This matches the Vector CANdb++ convention used by SignalDecoder.ts.
 */
function extractBitsMotorola(startBit: number, bitLength: number, data: Uint8Array): number {
  let value = 0;
  let bitPos = startBit;
  for (let i = 0; i < bitLength; i++) {
    const byteIndex = bitPos >> 3;
    const bitIndex = bitPos & 7;
    if (byteIndex < data.length && data[byteIndex] & (1 << bitIndex)) {
      value |= 1 << (bitLength - 1 - i); // MSB first
    }
    if (bitPos % 8 === 0) {
      bitPos += 15; // jump to MSB of next byte
    } else {
      bitPos -= 1;
    }
  }
  return value;
}

function toSigned(raw: number, bitLength: number): number {
  const signBit = 1 << (bitLength - 1);
  if (raw & signBit) {
    return raw - (1 << bitLength);
  }
  return raw;
}

export function decodeRawInteger(sig: SignalDescriptor, data: Uint8Array): number {
  const raw =
    sig.byteOrder === 'little_endian'
      ? extractBitsIntel(sig.startBit, sig.bitLength, data)
      : extractBitsMotorola(sig.startBit, sig.bitLength, data);
  if (sig.valueType === 'integer' && sig.isSigned) {
    return toSigned(raw, sig.bitLength);
  }
  return raw;
}

export function decodePhysical(sig: SignalDescriptor, data: Uint8Array): number {
  const raw = decodeRawInteger(sig, data);
  return raw * sig.factor + sig.offset;
}

/** Unsigned bit pattern for writing (two's complement when signed). */
export function rawToUnsignedPattern(raw: number, bitLength: number): number {
  const mask = bitLength >= 32 ? 0xffffffff : (1 << bitLength) - 1;
  return raw & mask;
}

function writeBitsIntel(
  startBit: number,
  bitLength: number,
  rawUnsigned: number,
  data: Uint8Array,
): void {
  let value = rawUnsigned >>> 0;
  if (bitLength < 32) {
    value &= (1 << bitLength) - 1;
  }
  let bitPos = startBit;
  for (let i = 0; i < bitLength; i++) {
    const byteIndex = bitPos >> 3;
    const bitIndex = bitPos & 7;
    if (byteIndex < data.length) {
      if (value & 1) {
        data[byteIndex] |= 1 << bitIndex;
      } else {
        data[byteIndex] &= ~(1 << bitIndex);
      }
    }
    value >>>= 1;
    bitPos++;
  }
}

function writeBitsMotorola(
  startBit: number,
  bitLength: number,
  rawUnsigned: number,
  data: Uint8Array,
): void {
  const value = rawUnsigned >>> 0;
  let bitPos = startBit;
  for (let i = 0; i < bitLength; i++) {
    const byteIndex = bitPos >> 3;
    const bitIndex = bitPos & 7;
    if (byteIndex < data.length) {
      if ((value >> (bitLength - 1 - i)) & 1) {
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

export function encodePhysical(sig: SignalDescriptor, physical: number, data: Uint8Array): void {
  let raw = Math.round((physical - sig.offset) / sig.factor);
  const signed = sig.valueType === 'integer' && sig.isSigned;
  if (signed) {
    const min = -Math.pow(2, sig.bitLength - 1);
    const max = Math.pow(2, sig.bitLength - 1) - 1;
    raw = Math.max(min, Math.min(max, raw));
  } else {
    const maxU = sig.bitLength >= 32 ? 0xffffffff : (1 << sig.bitLength) - 1;
    raw = Math.max(0, Math.min(maxU, raw));
  }
  const pattern = rawToUnsignedPattern(raw, sig.bitLength);
  if (sig.byteOrder === 'little_endian') {
    writeBitsIntel(sig.startBit, sig.bitLength, pattern, data);
  } else {
    writeBitsMotorola(sig.startBit, sig.bitLength, pattern, data);
  }
}

/** Strip invalid characters; keep only hex digits and spaces. */
export function sanitizeHexDigits(input: string): string {
  return input.replace(/[^0-9a-fA-F\s]/g, '');
}

/**
 * Parse hex string into exactly `byteCount` bytes (zero-padded).
 * Odd trailing nibble is treated as low nibble: "A" → 0x0A.
 */
export function bytesFromHexString(input: string, byteCount: number): number[] {
  const digitsOnly = input.replace(/\s/g, '').replace(/[^0-9a-fA-F]/g, '');
  const padded = digitsOnly.length % 2 === 1 ? `0${digitsOnly}` : digitsOnly;
  const out: number[] = [];
  for (let i = 0; i < padded.length && out.length < byteCount; i += 2) {
    out.push(parseInt(padded.slice(i, i + 2), 16));
  }
  while (out.length < byteCount) {
    out.push(0);
  }
  return out.slice(0, byteCount);
}

export function formatPayloadHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}
