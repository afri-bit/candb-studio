import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ByteOrder } from '../../../src/core/enums/ByteOrder';
import {
    analyzeMessageLayout,
    getSignalLsbMsbPhysicalBits,
    signalPhysicalBits,
    type OccupancySignal,
} from '../../../src/core/layout/bitOccupancy';
import { DbcParser } from '../../../src/infrastructure/parsers/dbc/DbcParser';

/** Compiled tests live under `out/test/...`; fixtures stay at repo `test/fixtures`. */
const FIXTURES_DIR = path.join(__dirname, '../../../..', 'test', 'fixtures');

function occ(
    name: string,
    startBit: number,
    bitLength: number,
    byteOrder: OccupancySignal['byteOrder'],
): OccupancySignal {
    return { name, startBit, bitLength, byteOrder };
}

function webviewByteOrder(order: ByteOrder): OccupancySignal['byteOrder'] {
    return order === ByteOrder.BigEndian ? 'big_endian' : 'little_endian';
}

suite('signalPhysicalBits / analyzeMessageLayout', () => {
    test('Intel: consecutive startBit … startBit+len-1', () => {
        const bits = signalPhysicalBits({
            startBit: 16,
            bitLength: 3,
            byteOrder: 'little_endian',
        });
        assert.deepStrictEqual(bits, [16, 17, 18]);
        const ends = getSignalLsbMsbPhysicalBits({
            startBit: 16,
            bitLength: 3,
            byteOrder: 'little_endian',
        });
        assert.strictEqual(ends.lsb, 16);
        assert.strictEqual(ends.msb, 18);
    });

    test('Motorola 16-bit @0 at bit 7 walks Vector sawtooth; lsb=8 msb=7', () => {
        const sig = { startBit: 7, bitLength: 16, byteOrder: 'big_endian' as const };
        assert.deepStrictEqual(
            signalPhysicalBits(sig),
            [7, 6, 5, 4, 3, 2, 1, 0, 15, 14, 13, 12, 11, 10, 9, 8],
        );
        const { lsb, msb } = getSignalLsbMsbPhysicalBits(sig);
        assert.strictEqual(lsb, 8);
        assert.strictEqual(msb, 7);
    });

    test('bitLength <= 0 returns []', () => {
        assert.deepStrictEqual(
            signalPhysicalBits({ startBit: 7, bitLength: 0, byteOrder: 'big_endian' }),
            [],
        );
        assert.deepStrictEqual(
            signalPhysicalBits({ startBit: 0, bitLength: -1, byteOrder: 'little_endian' }),
            [],
        );
        const ends = getSignalLsbMsbPhysicalBits({
            startBit: 7,
            bitLength: 0,
            byteOrder: 'big_endian',
        });
        assert.deepStrictEqual(ends, { lsb: 7, msb: 7 });
    });

    test('analyzeMessageLayout warns on zero-length signal and claims no bits for it', () => {
        const analysis = analyzeMessageLayout({
            dlc: 1,
            signals: [occ('Empty', 0, 0, 'little_endian')],
        });
        assert.ok(
            analysis.issues.some(
                (i) => i.kind === 'warning' && i.message.includes('bit length 0'),
            ),
        );
        assert.ok(analysis.cells.every((c) => c.sigIndices.length === 0));
    });

    test('mixed_endianness.dbc: Motorola 16-bit + Intel placements, no overlap', () => {
        const text = fs.readFileSync(path.join(FIXTURES_DIR, 'dbc', 'mixed_endianness.dbc'), 'utf8');
        const db = new DbcParser().parse(text);
        const msg = db.findMessageByName('MixedEndianTestFrame');
        assert.ok(msg, 'MixedEndianTestFrame should parse');

        const resolved = msg!.getResolvedSignals(db.signalPool, db);
        const moto = resolved.find((s) => s.name === 'BigEndian16bitSignal');
        assert.ok(moto);
        assert.strictEqual(moto!.byteOrder, ByteOrder.BigEndian);
        assert.deepStrictEqual(
            signalPhysicalBits({
                startBit: moto!.startBit,
                bitLength: moto!.bitLength,
                byteOrder: webviewByteOrder(moto!.byteOrder),
            }),
            [7, 6, 5, 4, 3, 2, 1, 0, 15, 14, 13, 12, 11, 10, 9, 8],
        );

        const intel1 = resolved.find((s) => s.name === 'LittleEndian2bitSignal1');
        assert.ok(intel1);
        assert.deepStrictEqual(
            signalPhysicalBits({
                startBit: intel1!.startBit,
                bitLength: intel1!.bitLength,
                byteOrder: webviewByteOrder(intel1!.byteOrder),
            }),
            [16, 17],
        );

        const analysis = analyzeMessageLayout({
            dlc: msg!.dlc,
            signals: resolved.map((s) =>
                occ(s.name, s.startBit, s.bitLength, webviewByteOrder(s.byteOrder)),
            ),
        });
        assert.strictEqual(analysis.overlapBits.length, 0);
        assert.deepStrictEqual(
            new Set(analysis.cells.filter((c) => c.sigIndices.length > 0).map((c) => c.bit)),
            new Set([
                0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                24, 25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39,
            ]),
        );
    });

    test('mixed-endian overlap: Intel span collides with Motorola sawtooth bits', () => {
        const analysis = analyzeMessageLayout({
            dlc: 8,
            signals: [
                occ('Moto16', 7, 16, 'big_endian'),
                occ('IntelOverlap', 8, 4, 'little_endian'),
            ],
        });
        assert.ok(analysis.overlapBits.includes(8));
        assert.ok(analysis.overlapBits.includes(9));
        assert.ok(analysis.overlapBits.includes(10));
        assert.ok(analysis.overlapBits.includes(11));
        assert.ok(analysis.issues.some((i) => i.kind === 'error' && i.message.includes('Overlapping')));
        assert.ok(analysis.overlapPairs.some((p) => p.bits.includes(8) && p.bits.includes(11)));
    });

    test('Motorola signal partially outside a 1-byte DLC warns and only claims in-payload bits', () => {
        const analysis = analyzeMessageLayout({
            dlc: 1,
            signals: [occ('Moto16', 7, 16, 'big_endian')],
        });
        assert.ok(
            analysis.issues.some(
                (i) => i.kind === 'warning' && i.message.includes('partially outside the payload'),
            ),
        );
        assert.deepStrictEqual(
            analysis.cells.filter((c) => c.sigIndices.length > 0).map((c) => c.bit),
            [0, 1, 2, 3, 4, 5, 6, 7],
        );
    });

    test('Motorola signal entirely outside DLC is warned and claims no cells', () => {
        const analysis = analyzeMessageLayout({
            dlc: 1,
            signals: [occ('FarMoto', 23, 8, 'big_endian')],
        });
        assert.ok(
            analysis.issues.some(
                (i) => i.kind === 'warning' && i.message.includes('does not map to any bit inside this DLC'),
            ),
        );
        assert.ok(analysis.cells.every((c) => c.sigIndices.length === 0));
    });
});
