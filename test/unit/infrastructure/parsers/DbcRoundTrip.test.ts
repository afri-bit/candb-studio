import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { DbcSerializer } from '../../../../src/infrastructure/parsers/dbc/DbcSerializer';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { SignalValueType } from '../../../../src/core/enums/SignalValueType';
import { MultiplexIndicator } from '../../../../src/core/enums/MultiplexIndicator';

const FIXTURES_DIR = path.join(__dirname, '../../../../..', 'test', 'fixtures');

/** Parse → serialize → re-parse. Returns the re-parsed database. */
function roundTrip(dbc: string) {
    const parser = new DbcParser();
    const serializer = new DbcSerializer();
    const db1 = parser.parse(dbc);
    const serialized = serializer.serialize(db1);
    return { db: parser.parse(serialized), serialized };
}

/** Parse → serialize → parse → serialize → parse → serialize. Returns both final serializations. */
function doubleRoundTrip(dbc: string): { first: string; second: string } {
    const parser = new DbcParser();
    const serializer = new DbcSerializer();
    const first = serializer.serialize(parser.parse(dbc));
    const second = serializer.serialize(parser.parse(first));
    return { first, second };
}

suite('DbcRoundTrip', () => {
    suite('structural fields survive round-trip', () => {
        const dbc = [
            'VERSION "2.0"',
            'NS_ :',
            'BS_:',
            'BU_: ECU1 ECU2 GW',
            'BO_ 100 EngineStatus: 8 ECU1',
            ' SG_ RPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECU2,GW',
            ' SG_ Temp : 16|8@1- (1,-40) [-40|215] "degC" ECU2',
            ' SG_ Load : 24|8@0+ (0.39216,0) [0|100] "%" GW',
            'BO_ 200 BrakeStatus: 4 ECU2',
            ' SG_ Pressure : 0|12@1+ (0.1,0) [0|409.5] "bar" ECU1',
        ].join('\n');

        test('VERSION survives round-trip', () => {
            assert.strictEqual(roundTrip(dbc).db.version, '2.0');
        });

        test('node list survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.ok(db.findNodeByName('ECU1'));
            assert.ok(db.findNodeByName('ECU2'));
            assert.ok(db.findNodeByName('GW'));
        });

        test('message count survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.messages.length, 2);
        });

        test('message IDs survive round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.ok(db.findMessageById(100));
            assert.ok(db.findMessageById(200));
        });

        test('signal startBit survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const rpm = db.findPoolSignalByName('RPM')!;
            assert.strictEqual(rpm.startBit, 0);
        });

        test('signal bitLength survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const rpm = db.findPoolSignalByName('RPM')!;
            assert.strictEqual(rpm.bitLength, 16);
        });

        test('signal factor and offset survive round-trip', () => {
            const { db } = roundTrip(dbc);
            const rpm = db.findPoolSignalByName('RPM')!;
            assert.strictEqual(rpm.factor, 0.25);
            assert.strictEqual(rpm.offset, 0);
        });

        test('signal negative offset survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const temp = db.findPoolSignalByName('Temp')!;
            assert.strictEqual(temp.offset, -40);
        });

        test('signal minimum and maximum survive round-trip', () => {
            const { db } = roundTrip(dbc);
            const rpm = db.findPoolSignalByName('RPM')!;
            assert.strictEqual(rpm.minimum, 0);
            assert.strictEqual(rpm.maximum, 16383.75);
        });

        test('signal unit survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findPoolSignalByName('RPM')!.unit, 'rpm');
        });

        test('signal receivingNodes survive round-trip', () => {
            const { db } = roundTrip(dbc);
            const rpm = db.findPoolSignalByName('RPM')!;
            assert.deepStrictEqual(rpm.receivingNodes, ['ECU2', 'GW']);
        });

        test('little-endian byteOrder survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findPoolSignalByName('RPM')!.byteOrder, ByteOrder.LittleEndian);
        });

        test('big-endian byteOrder survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findPoolSignalByName('Load')!.byteOrder, ByteOrder.BigEndian);
        });

        test('signed valueType survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findPoolSignalByName('Temp')!.valueType, SignalValueType.Signed);
        });

        test('unsigned valueType survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findPoolSignalByName('RPM')!.valueType, SignalValueType.Unsigned);
        });

        test('message DLC survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findMessageById(100)!.dlc, 8);
        });

        test('message transmittingNode survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findMessageById(100)!.transmittingNode, 'ECU1');
        });
    });

    suite('comments survive round-trip', () => {
        const dbc = [
            'VERSION ""',
            'BU_: ECU1',
            'BO_ 100 Msg: 8 ECU1',
            ' SG_ RPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECU1',
            'CM_ "Network comment";',
            'CM_ BU_ ECU1 "Engine control unit";',
            'CM_ BO_ 100 "Engine status message";',
            'CM_ SG_ 100 RPM "Engine rotational speed in RPM";',
        ].join('\n');

        test('network comment survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.comment, 'Network comment');
        });

        test('node comment survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findNodeByName('ECU1')!.comment, 'Engine control unit');
        });

        test('message comment survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.findMessageById(100)!.comment, 'Engine status message');
        });

        test('signal comment survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(
                db.findPoolSignalByName('RPM')!.comment,
                'Engine rotational speed in RPM',
            );
        });

        test('comment with embedded double quotes survives round-trip', () => {
            const { db } = roundTrip([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ Val : 0|8@1+ (1,0) [0|255] "" ECU1',
                'CM_ SG_ 100 Val "Signal \\"Val\\" description";',
            ].join('\n'));
            assert.strictEqual(
                db.findPoolSignalByName('Val')!.comment,
                'Signal "Val" description',
            );
        });
    });

    suite('VAL_TABLE_ and VAL_ survive round-trip', () => {
        const dbc = fs.readFileSync(
            path.join(FIXTURES_DIR, 'dbc', 'val_descriptions.dbc'),
            'utf-8',
        );

        test('VAL_TABLE_ entry count survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(db.valueTables.length, 2);
        });

        test('VAL_TABLE_ entries survive round-trip', () => {
            const { db } = roundTrip(dbc);
            const gearTable = db.valueTables.find((vt) => vt.name === 'GearTable');
            assert.ok(gearTable, 'GearTable must survive');
            assert.strictEqual(gearTable!.entries.get(0), 'Park');
            assert.strictEqual(gearTable!.entries.get(4), 'Sport');
        });

        test('VAL_ descriptions survive round-trip', () => {
            const { db } = roundTrip(dbc);
            const descs = db.findValueDescription(200, 'Active')?.descriptions;
            assert.ok(descs, 'Active value descriptions must survive');
            assert.strictEqual(descs!.get(0), 'Inactive');
            assert.strictEqual(descs!.get(1), 'Active');
        });

        test('VAL_ with negative key survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const descs = db.findValueDescription(200, 'Direction')?.descriptions;
            assert.ok(descs, 'Direction descriptions must exist');
            assert.strictEqual(descs!.get(-1), 'Reverse');
        });
    });

    suite('attributes survive round-trip', () => {
        const dbc = fs.readFileSync(
            path.join(FIXTURES_DIR, 'dbc', 'all_attr_types.dbc'),
            'utf-8',
        );

        test('INT BA_DEF_ survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const def = db.findAttributeDefinition('GenMsgCycleTime');
            assert.ok(def);
            assert.strictEqual(def!.maximum, 65535);
        });

        test('FLOAT BA_DEF_ survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const def = db.findAttributeDefinition('InitValue');
            assert.ok(def);
            assert.strictEqual(def!.maximum, 100);
        });

        test('STRING BA_DEF_ survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.ok(db.findAttributeDefinition('BusType'));
        });

        test('ENUM BA_DEF_ enum values survive round-trip', () => {
            const { db } = roundTrip(dbc);
            const def = db.findAttributeDefinition('SystemClass');
            assert.ok(def);
            assert.deepStrictEqual(def!.enumValues, ['Class_A', 'Class_B', 'Class_C']);
        });

        test('HEX BA_DEF_ survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const def = db.findAttributeDefinition('SigType');
            assert.ok(def);
            assert.strictEqual(def!.maximum, 255);
        });

        test('network-scope BA_DEF_ survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.ok(db.findAttributeDefinition('NetworkName'));
        });

        test('BA_ INT value survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const attr = db.attributes.find(
                (a) => a.definitionName === 'GenMsgCycleTime' && a.messageId === 100,
            );
            assert.ok(attr);
            assert.strictEqual(attr!.value, 10);
        });

        test('BA_ STRING value survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const attr = db.attributes.find(
                (a) => a.definitionName === 'BusType' && a.messageId === 100,
            );
            assert.ok(attr);
            assert.strictEqual(attr!.value, 'CAN');
        });

        test('BA_ network-scope value survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const attr = db.attributes.find(
                (a) => a.definitionName === 'NetworkName',
            );
            assert.ok(attr);
            assert.strictEqual(attr!.value, 'TestNetwork');
        });
    });

    suite('multiplexing survives round-trip', () => {
        const dbc = fs.readFileSync(
            path.join(FIXTURES_DIR, 'dbc', 'multiplexed.dbc'),
            'utf-8',
        );

        test('multiplexor indicator survives round-trip', () => {
            const { db } = roundTrip(dbc);
            assert.strictEqual(
                db.findPoolSignalByName('GearSelector')!.multiplexIndicator,
                MultiplexIndicator.Multiplexor,
            );
        });

        test('m0 multiplexed indicator survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const sig = db.findPoolSignalByName('DriveData')!;
            assert.strictEqual(sig.multiplexIndicator, MultiplexIndicator.MultiplexedSignal);
            assert.strictEqual(sig.multiplexValue, 0);
        });

        test('m1 multiplexed indicator survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const sig = db.findPoolSignalByName('ReverseData')!;
            assert.strictEqual(sig.multiplexIndicator, MultiplexIndicator.MultiplexedSignal);
            assert.strictEqual(sig.multiplexValue, 1);
        });

        test('m2 multiplexed indicator survives round-trip', () => {
            const { db } = roundTrip(dbc);
            const sig = db.findPoolSignalByName('NeutralFlag')!;
            assert.strictEqual(sig.multiplexValue, 2);
        });
    });

    suite('extended CAN IDs survive round-trip', () => {
        test('raw extended ID is preserved through round-trip', () => {
            const { db } = roundTrip(
                fs.readFileSync(path.join(FIXTURES_DIR, 'dbc', 'extended_ids.dbc'), 'utf-8'),
            );
            assert.ok(db.findMessageById(2566903870), 'extended ID message must survive');
            assert.ok(db.findMessageById(100), 'standard ID message must survive');
        });
    });

    suite('serialization stability — double round-trip', () => {
        const fixtures = [
            'sample.dbc',
            path.join('dbc', 'multiplexed.dbc'),
            path.join('dbc', 'extended_ids.dbc'),
            path.join('dbc', 'all_attr_types.dbc'),
            path.join('dbc', 'val_descriptions.dbc'),
            path.join('dbc', 'multi_message.dbc'),
        ];

        for (const fixture of fixtures) {
            test(`serialize(parse(serialize(parse(x)))) === serialize(parse(x)) for ${path.basename(fixture)}`, () => {
                const content = fs.readFileSync(path.join(FIXTURES_DIR, fixture), 'utf-8');
                const { first, second } = doubleRoundTrip(content);
                assert.strictEqual(
                    second,
                    first,
                    `Serialization is not stable for ${fixture}`,
                );
            });
        }
    });
});
