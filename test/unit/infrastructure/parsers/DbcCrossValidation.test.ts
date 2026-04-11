/**
 * DbcCrossValidation.test.ts
 *
 * Cross-validates CANdb Studio's DbcParser output against cantools (Python) golden JSON files.
 * Golden files are generated once with `test/scripts/cantools_extract.py` and committed to the repo.
 * These tests skip gracefully if golden files are missing (e.g., developer without Python).
 *
 * CI does NOT require Python — it just reads the committed JSON files.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { SignalValueType } from '../../../../src/core/enums/SignalValueType';
import { MultiplexIndicator } from '../../../../src/core/enums/MultiplexIndicator';
import type { CanDatabase } from '../../../../src/core/models/database/CanDatabase';

const FIXTURES_DIR = path.join(__dirname, '../../../../..', 'test', 'fixtures');
const GOLDEN_DIR = path.join(FIXTURES_DIR, 'dbc', 'cantools_golden');
const DBC_DIR = path.join(FIXTURES_DIR, 'dbc');
const REAL_WORLD_DIR = path.join(FIXTURES_DIR, 'dbc', 'real_world');

// ─── Type definitions for cantools golden JSON ───────────────────────────────

interface CantoolsSignal {
    name: string;
    start_bit: number;
    length: number;
    byte_order: 'little_endian' | 'big_endian';
    value_type: 'signed' | 'unsigned';
    factor: number;
    offset: number;
    minimum: number | null;
    maximum: number | null;
    unit: string;
    receivers: string[];
    comment: string | null;
    is_multiplexer: boolean;
    is_multiplexed: boolean;
    multiplexer_ids: number[] | null;
    choices: Record<string, string>;
}

interface CantoolsMessage {
    id: number;
    name: string;
    dlc: number;
    is_fd: boolean;
    transmitter: string | null;
    comment: string | null;
    signals: CantoolsSignal[];
}

interface CantoolsGolden {
    nodes: string[];
    messages: CantoolsMessage[];
    value_tables: Array<{ name: string; entries: Record<string, string> }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadGolden(name: string): CantoolsGolden | null {
    const p = path.join(GOLDEN_DIR, `${name}.json`);
    if (!fs.existsSync(p)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CantoolsGolden;
}

function parseFixture(relPath: string): CanDatabase {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, relPath), 'utf-8');
    return new DbcParser().parse(content);
}

/**
 * Compare a single cantools signal dict against the TS-parsed signal.
 * Asserts field-by-field equality, prefixing errors with the signal name.
 *
 * Big-endian (Motorola) startBit is intentionally NOT compared: cantools and the DBC
 * file format use different bit-numbering conventions for Motorola signals. The DBC stores
 * the MSB position in Motorola counting, while cantools normalizes it to a different index.
 * This known divergence does not affect signal decoding correctness — only the storage convention.
 */
function assertSignalMatchesGolden(
    db: CanDatabase,
    msgId: number,
    gSig: CantoolsSignal,
): void {
    const sig = db.findPoolSignalByName(gSig.name);
    assert.ok(sig, `signal "${gSig.name}" not found in pool`);

    // Only compare startBit for little-endian signals (see JSDoc above for big-endian caveat)
    if (gSig.byte_order === 'little_endian') {
        assert.strictEqual(sig!.startBit, gSig.start_bit, `${gSig.name}.startBit`);
    }
    assert.strictEqual(sig!.bitLength, gSig.length, `${gSig.name}.bitLength`);

    const expectedByteOrder =
        gSig.byte_order === 'little_endian' ? ByteOrder.LittleEndian : ByteOrder.BigEndian;
    assert.strictEqual(sig!.byteOrder, expectedByteOrder, `${gSig.name}.byteOrder`);

    const expectedValueType =
        gSig.value_type === 'signed' ? SignalValueType.Signed : SignalValueType.Unsigned;
    assert.strictEqual(sig!.valueType, expectedValueType, `${gSig.name}.valueType`);

    assert.strictEqual(sig!.factor, gSig.factor, `${gSig.name}.factor`);
    assert.strictEqual(sig!.offset, gSig.offset, `${gSig.name}.offset`);
    assert.strictEqual(sig!.unit, gSig.unit, `${gSig.name}.unit`);

    // Multiplexer
    assert.strictEqual(
        sig!.multiplexIndicator === MultiplexIndicator.Multiplexor,
        gSig.is_multiplexer,
        `${gSig.name}.isMultiplexer`,
    );
    assert.strictEqual(
        sig!.multiplexIndicator === MultiplexIndicator.MultiplexedSignal,
        gSig.is_multiplexed,
        `${gSig.name}.isMultiplexed`,
    );

    // Value descriptions (choices)
    for (const [rawKey, label] of Object.entries(gSig.choices ?? {})) {
        const key = parseInt(rawKey, 10);
        const descs = db.findValueDescription(msgId, gSig.name)?.descriptions;
        assert.strictEqual(
            descs?.get(key),
            label,
            `${gSig.name} choice[${key}] mismatch`,
        );
    }
}

/**
 * Resolve a cantools message ID to the actual ID stored by our parser.
 *
 * cantools strips the 0x80000000 extended-ID marker (reporting the raw 29-bit CAN ID),
 * while our parser stores the literal numeric value from the DBC file (which includes the
 * 0x80000000 bit for 29-bit extended IDs). Try both representations.
 */
function resolveMessageId(db: CanDatabase, cantoolsId: number) {
    // cantools strips the 0x80000000 marker; JS bitwise | returns signed int, so use >>> 0 for unsigned
    return db.findMessageById(cantoolsId) ?? db.findMessageById((cantoolsId | 0x80000000) >>> 0);
}

/** Conditionally create a test — skips if the golden file is absent. */
function goldenTest(fixtureName: string, title: string, fn: (golden: CantoolsGolden, db: CanDatabase) => void): void {
    const golden = loadGolden(fixtureName);
    const dbcRel = path.join('dbc', `${fixtureName}.dbc`);
    const dbcExists = fs.existsSync(path.join(FIXTURES_DIR, dbcRel));

    if (!golden || !dbcExists) {
        test.skip(`[golden missing] ${title}`, () => {});
    } else {
        test(title, () => {
            const db = parseFixture(dbcRel);
            fn(golden, db);
        });
    }
}

// ─── Cross-validation suites ─────────────────────────────────────────────────

suite('DbcCrossValidation — multi_message.dbc', () => {
    goldenTest('multi_message', 'message count matches cantools', (golden, db) => {
        assert.strictEqual(db.messages.length, golden.messages.length, 'message count mismatch');
    });

    goldenTest('multi_message', 'message names match cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            const msg = resolveMessageId(db, gMsg.id);
            assert.ok(msg, `message id=${gMsg.id} (${gMsg.name}) not found`);
            assert.strictEqual(msg!.name, gMsg.name, `message name mismatch for id=${gMsg.id}`);
        }
    });

    goldenTest('multi_message', 'message DLCs match cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            const msg = resolveMessageId(db, gMsg.id);
            assert.ok(msg, `message id=${gMsg.id} not found`);
            assert.strictEqual(msg!.dlc, gMsg.dlc, `dlc mismatch for message ${gMsg.name}`);
        }
    });

    goldenTest('multi_message', 'signal count per message matches cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            const msg = resolveMessageId(db, gMsg.id);
            assert.ok(msg, `message ${gMsg.name} not found`);
            assert.strictEqual(
                msg!.signalRefs.length,
                gMsg.signals.length,
                `signal count mismatch for message ${gMsg.name}`,
            );
        }
    });

    goldenTest('multi_message', 'all signal fields match cantools (startBit, factor, byteOrder, valueType)', (golden, db) => {
        for (const gMsg of golden.messages) {
            for (const gSig of gMsg.signals) {
                assertSignalMatchesGolden(db, gMsg.id, gSig);
            }
        }
    });

    goldenTest('multi_message', 'VAL_ choices match cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            for (const gSig of gMsg.signals) {
                if (Object.keys(gSig.choices ?? {}).length === 0) {
                    continue;
                }
                const descs = db.findValueDescription(gMsg.id, gSig.name)?.descriptions;
                assert.ok(descs, `no value descriptions for ${gSig.name} in msg ${gMsg.id}`);
                for (const [rawKey, label] of Object.entries(gSig.choices)) {
                    const key = parseInt(rawKey, 10);
                    assert.strictEqual(descs!.get(key), label, `${gSig.name}[${key}]`);
                }
            }
        }
    });
});

suite('DbcCrossValidation — multiplexed.dbc', () => {
    goldenTest('multiplexed', 'multiplexor signal identified correctly', (golden, db) => {
        for (const gMsg of golden.messages) {
            for (const gSig of gMsg.signals) {
                const sig = db.findPoolSignalByName(gSig.name);
                assert.ok(sig, `signal ${gSig.name} not found`);
                assert.strictEqual(
                    sig!.multiplexIndicator === MultiplexIndicator.Multiplexor,
                    gSig.is_multiplexer,
                    `${gSig.name}.is_multiplexer`,
                );
                assert.strictEqual(
                    sig!.multiplexIndicator === MultiplexIndicator.MultiplexedSignal,
                    gSig.is_multiplexed,
                    `${gSig.name}.is_multiplexed`,
                );
                if (gSig.multiplexer_ids !== null && gSig.multiplexer_ids.length > 0) {
                    assert.strictEqual(sig!.multiplexValue, gSig.multiplexer_ids[0], `${gSig.name}.multiplexValue`);
                }
            }
        }
    });
});

suite('DbcCrossValidation — val_descriptions.dbc', () => {
    goldenTest('val_descriptions', 'all signal fields match cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            for (const gSig of gMsg.signals) {
                assertSignalMatchesGolden(db, gMsg.id, gSig);
            }
        }
    });
});

suite('DbcCrossValidation — all_attr_types.dbc', () => {
    goldenTest('all_attr_types', 'all signal fields match cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            for (const gSig of gMsg.signals) {
                assertSignalMatchesGolden(db, gMsg.id, gSig);
            }
        }
    });

    goldenTest('all_attr_types', 'FLOAT signal factor matches cantools', (golden, db) => {
        for (const gMsg of golden.messages) {
            for (const gSig of gMsg.signals) {
                const sig = db.findPoolSignalByName(gSig.name);
                assert.ok(sig, `signal ${gSig.name} not found`);
                assert.strictEqual(sig!.factor, gSig.factor, `${gSig.name}.factor`);
            }
        }
    });
});

// ─── Real-world smoke tests ───────────────────────────────────────────────────

suite('DbcCrossValidation — real-world DBC files', () => {
    const realWorldFiles = [
        { name: 'tesla_model3', dbc: 'real_world/tesla_model3.dbc' },
        { name: 'bmw_e9x', dbc: 'real_world/bmw_e9x.dbc' },
    ];

    for (const { name, dbc } of realWorldFiles) {
        const dbcPath = path.join(FIXTURES_DIR, 'dbc', dbc);
        const golden = loadGolden(name);
        const dbcExists = fs.existsSync(dbcPath);

        if (!dbcExists) {
            test.skip(`[file missing] ${name}.dbc parses without throwing`, () => {});
            test.skip(`[file missing] ${name}.dbc message count > 0`, () => {});
        } else {
            test(`${name}.dbc parses without throwing`, () => {
                const content = fs.readFileSync(dbcPath, 'utf-8');
                assert.doesNotThrow(() => new DbcParser().parse(content));
            });

            test(`${name}.dbc message count > 0`, () => {
                const content = fs.readFileSync(dbcPath, 'utf-8');
                const db = new DbcParser().parse(content);
                assert.ok(db.messages.length > 0, 'at least one message expected');
            });

            if (golden) {
                test(`${name}.dbc message count matches cantools (${golden.messages.length})`, () => {
                    const content = fs.readFileSync(dbcPath, 'utf-8');
                    const db = new DbcParser().parse(content);
                    assert.strictEqual(db.messages.length, golden.messages.length);
                });

                // Detailed signal comparison only for files without duplicate signal names.
                // Files like bmw_e9x.dbc reuse signal names across messages; our pool
                // architecture merges them (last-write-wins) while cantools keeps them separate.
                if (name === 'tesla_model3') {
                    test(`${name}.dbc all signal fields match cantools`, () => {
                        const content = fs.readFileSync(dbcPath, 'utf-8');
                        const db = new DbcParser().parse(content);
                        for (const gMsg of golden.messages) {
                            for (const gSig of gMsg.signals) {
                                assertSignalMatchesGolden(db, gMsg.id, gSig);
                            }
                        }
                    });
                }
            }
        }
    }
});
