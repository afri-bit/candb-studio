/**
 * DBC bit map analysis. Bit occupancy is byte-order aware: Intel signals occupy a
 * linear span, Motorola signals follow the Vector CANdb++ sawtooth (see
 * {@link signalPhysicalBits}).
 */
import type { MessageDescriptor, SignalDescriptor } from './types';

/**
 * Ordered list of physical DBC bit indices a signal occupies, from its logical LSB
 * bit sequence start to end.
 *
 * - **Intel (little endian)**: consecutive bits `startBit … startBit + bitLength - 1`;
 *   `startBit` is the LSB.
 * - **Motorola (big endian)**: `startBit` is the MSB. Navigate MSB→LSB: decrement
 *   within a byte, and jump to the MSB of the next byte (`+15`) when crossing a byte
 *   boundary. Matches `extractBitsMotorola` / the host `SignalDecoder`.
 *
 * The returned array is ordered MSB→LSB for Motorola and LSB→MSB for Intel, so the
 * first element is `startBit` and the last element is the opposite endpoint.
 */
export function signalPhysicalBits(
  sig: Pick<SignalDescriptor, 'startBit' | 'bitLength' | 'byteOrder'>,
): number[] {
  const { startBit, bitLength, byteOrder } = sig;
  if (bitLength <= 0) {
    return [];
  }
  if (byteOrder === 'little_endian') {
    const bits: number[] = [];
    for (let i = 0; i < bitLength; i++) {
      bits.push(startBit + i);
    }
    return bits;
  }
  const bits: number[] = [];
  let bitPos = startBit;
  for (let i = 0; i < bitLength; i++) {
    bits.push(bitPos);
    if (bitPos % 8 === 0) {
      bitPos += 15; // jump to MSB of next byte
    } else {
      bitPos -= 1;
    }
  }
  return bits;
}

/**
 * Physical bit indices of the logical LSB and MSB of the raw value.
 *
 * - **Intel (little endian)**: LSB at `startBit`, MSB at `startBit + bitLength - 1`.
 * - **Motorola (big endian)**: MSB at `startBit`, LSB at the end of the sawtooth walk.
 */
export function getSignalLsbMsbPhysicalBits(
  sig: Pick<SignalDescriptor, 'startBit' | 'bitLength' | 'byteOrder'>,
): { lsb: number; msb: number } {
  const { startBit, byteOrder } = sig;
  const bits = signalPhysicalBits(sig);
  if (bits.length === 0) {
    return { lsb: startBit, msb: startBit };
  }
  const first = bits[0];
  const last = bits[bits.length - 1];
  if (byteOrder === 'little_endian') {
    return { lsb: first, msb: last };
  }
  return { msb: first, lsb: last };
}

export interface LayoutIssue {
  kind: 'error' | 'warning';
  message: string;
  signalNames?: string[];
}

export interface BitCellAnalysis {
  bit: number;
  /** Signal indices (message.signals order) claiming this bit; empty = unallocated */
  sigIndices: number[];
}

export interface MessageLayoutAnalysis {
  totalBits: number;
  cells: BitCellAnalysis[];
  /** Bits with more than one signal */
  overlapBits: number[];
  /** Pairs of signal indices that overlap (i < j) */
  overlapPairs: { i: number; j: number; bits: number[] }[];
  /** Bits with no signal */
  unallocatedBits: number[];
  issues: LayoutIssue[];
}

/**
 * Analyze bit claims for overlap, gaps, and signals outside the payload.
 */
export function analyzeMessageLayout(message: MessageDescriptor): MessageLayoutAnalysis {
  const totalBits = message.dlc * 8;
  const claims: number[][] = Array.from({ length: totalBits }, () => []);

  const issues: LayoutIssue[] = [];

  message.signals.forEach((sig, sigIdx) => {
    if (sig.bitLength <= 0) {
      issues.push({
        kind: 'warning',
        message: `Signal "${sig.name}" has bit length 0.`,
        signalNames: [sig.name],
      });
      return;
    }

    const physical = signalPhysicalBits(sig);
    const lo = Math.min(...physical);
    const hi = Math.max(...physical);
    const inPayloadBits = physical.filter((p) => p >= 0 && p < totalBits);
    if (inPayloadBits.length === 0) {
      issues.push({
        kind: 'warning',
        message: `Signal "${sig.name}" does not map to any bit inside this DLC (bits ${lo}…${hi}, payload 0…${totalBits - 1}).`,
        signalNames: [sig.name],
      });
      return;
    }

    if (inPayloadBits.length < physical.length) {
      issues.push({
        kind: 'warning',
        message: `Signal "${sig.name}" is partially outside the payload (covers ${lo}…${hi}; valid 0…${totalBits - 1}).`,
        signalNames: [sig.name],
      });
    }

    for (const bit of inPayloadBits) {
      if (!claims[bit].includes(sigIdx)) {
        claims[bit].push(sigIdx);
      }
    }
  });

  const cells: BitCellAnalysis[] = claims.map((sigIndices, bit) => ({ bit, sigIndices }));

  const overlapBits: number[] = [];
  for (let b = 0; b < totalBits; b++) {
    if (claims[b].length > 1) {
      overlapBits.push(b);
    }
  }

  const pairMap = new Map<string, number[]>();
  for (const b of overlapBits) {
    const idxs = [...claims[b]].sort((a, c) => a - c);
    for (let a = 0; a < idxs.length; a++) {
      for (let c = a + 1; c < idxs.length; c++) {
        const i = idxs[a];
        const j = idxs[c];
        const key = `${i}-${j}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, []);
        }
        pairMap.get(key)!.push(b);
      }
    }
  }

  const overlapPairs: { i: number; j: number; bits: number[] }[] = [];
  pairMap.forEach((bits, key) => {
    const [si, sj] = key.split('-').map(Number);
    overlapPairs.push({ i: si, j: sj, bits });
  });

  const unallocatedBits: number[] = [];
  for (let b = 0; b < totalBits; b++) {
    if (claims[b].length === 0) {
      unallocatedBits.push(b);
    }
  }

  if (overlapBits.length > 0) {
    const names = new Set<string>();
    for (const p of overlapPairs) {
      names.add(message.signals[p.i]?.name ?? `?${p.i}`);
      names.add(message.signals[p.j]?.name ?? `?${p.j}`);
    }
    issues.unshift({
      kind: 'error',
      message: `Overlapping signals share ${overlapBits.length} bit position(s).`,
      signalNames: [...names],
    });
  }

  if (unallocatedBits.length > 0) {
    issues.push({
      kind: 'warning',
      message: `${unallocatedBits.length} bit(s) in the payload have no signal (gaps).`,
    });
  }

  return {
    totalBits,
    cells,
    overlapBits,
    overlapPairs,
    unallocatedBits,
    issues,
  };
}
