/**
 * Byte-order-aware DBC bit occupancy (Vector CANdb++ Motorola sawtooth).
 * Shared by the visual editor layout grid and unit tests.
 */

export type OccupancyByteOrder = 'little_endian' | 'big_endian';

export type OccupancyMultiplexIndicator = 'none' | 'multiplexor' | number;

export interface OccupancySignal {
    name: string;
    startBit: number;
    bitLength: number;
    byteOrder: OccupancyByteOrder;
    multiplex: OccupancyMultiplexIndicator;
}

export interface OccupancyMessage {
    dlc: number;
    signals: OccupancySignal[];
}

/**
 * Ordered list of physical DBC bit indices a signal occupies.
 *
 * - **Intel**: consecutive `startBit … startBit + bitLength - 1`; `startBit` is the LSB.
 * - **Motorola**: `startBit` is the MSB. Walk MSB→LSB: decrement within a byte, jump
 *   to the next byte’s MSB (`+15`) at a byte boundary.
 */
export function signalPhysicalBits(
    sig: Pick<OccupancySignal, 'startBit' | 'bitLength' | 'byteOrder'>,
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
            bitPos += 15;
        } else {
            bitPos -= 1;
        }
    }
    return bits;
}

/**
 * Physical bit indices of the logical LSB and MSB of the raw value.
 */
export function getSignalLsbMsbPhysicalBits(
    sig: Pick<OccupancySignal, 'startBit' | 'bitLength' | 'byteOrder'>,
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
    sigIndices: number[];
}

export interface MessageLayoutAnalysis {
    totalBits: number;
    cells: BitCellAnalysis[];
    overlapBits: number[];
    overlapPairs: { i: number; j: number; bits: number[] }[];
    unallocatedBits: number[];
    issues: LayoutIssue[];
}

/**
 * Analyze bit claims for overlap, gaps, and signals outside the payload.
 */
export function analyzeMessageLayout(message: OccupancyMessage): MessageLayoutAnalysis {
    const totalBits = message.dlc * 8;
    const claims: number[][] = Array.from({ length: totalBits }, () => []);

    const issues: LayoutIssue[] = [];

    message.signals.forEach((sig: OccupancySignal, sigIdx: number) => {
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

/** Distinct multiplexed selector values used by a message's signals, ascending. */
export function multiplexorValues(message: OccupancyMessage): number[] {
  const values = new Set<number>();
  for (const s of message.signals) {
    if (typeof s.multiplex === 'number') {
      values.add(s.multiplex);
    }
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * Whether a signal is present for the given multiplexor selector value.
 * Non-multiplexed signals and the multiplexor itself are always present; a
 * multiplexed signal is present only when its value matches `muxValue`.
 * `muxValue === null` shows every signal.
 */
export function signalActiveForMux(
  sig: Pick<OccupancySignal, 'multiplex'>,
  muxValue: number | null,
): boolean {
  if (muxValue === null) {
    return true;
  }
  if (typeof sig.multiplex === 'number') {
    return sig.multiplex === muxValue;
  }
  return true;
}

/**
 * A shallow copy of `message` whose signals are limited to the selected mux group
 * (non-multiplexed signals and the multiplexor are always kept). Returns the
 * original message when `muxValue` is `null`.
 */
export function messageForMux(
  message: OccupancyMessage,
  muxValue: number | null,
): OccupancyMessage {
  if (muxValue === null) {
    return message;
  }
  return {
    ...message,
    signals: message.signals.filter((s) => signalActiveForMux(s, muxValue)),
  };
}
