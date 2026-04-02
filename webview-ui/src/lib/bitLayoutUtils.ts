/**
 * Linear DBC bit map analysis (startBit + consecutive bits, same as editor model).
 */
import type { MessageDescriptor, SignalDescriptor } from './types';

/**
 * Physical bit indices of the logical LSB and MSB of the raw value, for a contiguous
 * `[startBit, startBit + bitLength)` span (same as {@link analyzeMessageLayout}).
 *
 * - **Intel (little endian)**: LSB at `startBit`, MSB at `startBit + bitLength - 1` (matches host decoder).
 * - **Motorola (big endian)**: MSB at `startBit`, LSB at `startBit + bitLength - 1`.
 */
export function getSignalLsbMsbPhysicalBits(
  sig: Pick<SignalDescriptor, 'startBit' | 'bitLength' | 'byteOrder'>,
): { lsb: number; msb: number } {
  const { startBit, bitLength, byteOrder } = sig;
  if (bitLength <= 0) {
    return { lsb: startBit, msb: startBit };
  }
  const hi = startBit + bitLength - 1;
  if (byteOrder === 'little_endian') {
    return { lsb: startBit, msb: hi };
  }
  return { msb: startBit, lsb: hi };
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

function rangeBits(startBit: number, bitLength: number, totalBits: number): number[] {
  const bits: number[] = [];
  for (let b = 0; b < bitLength; b++) {
    const p = startBit + b;
    if (p >= 0 && p < totalBits) {
      bits.push(p);
    }
  }
  return bits;
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

    const lo = sig.startBit;
    const hi = sig.startBit + sig.bitLength - 1;
    const inPayload = lo < totalBits && hi >= 0;
    if (!inPayload) {
      issues.push({
        kind: 'warning',
        message: `Signal "${sig.name}" does not map to any bit inside this DLC (bits ${lo}…${hi}, payload 0…${totalBits - 1}).`,
        signalNames: [sig.name],
      });
      return;
    }

    if (lo < 0 || hi >= totalBits) {
      issues.push({
        kind: 'warning',
        message: `Signal "${sig.name}" is partially outside the payload (covers ${lo}…${hi}; valid 0…${totalBits - 1}).`,
        signalNames: [sig.name],
      });
    }

    const bits = rangeBits(sig.startBit, sig.bitLength, totalBits);
    if (bits.length === 0) {
      return;
    }
    for (const bit of bits) {
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
