import * as assert from 'assert';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { DbcSerializer } from '../../../../src/infrastructure/parsers/dbc/DbcSerializer';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { SignalValueType } from '../../../../src/core/enums/SignalValueType';
import { MultiplexIndicator } from '../../../../src/core/enums/MultiplexIndicator';

/** Helper: parse a DBC string and serialize it back. */
function parseAndSerialize(dbc: string): string {
    return new DbcSerializer().serialize(new DbcParser().parse(dbc));
}

/** Helper: find a signal line in serialized output. */
function findSignalLine(output: string, signalName: string): string | undefined {
    return output
        .split('\n')
        .find((l) => l.trim().startsWith(`SG_ ${signalName} `));
}

suite('DbcSerializer', () => {
    suite('signal byte order and value type notation', () => {
        const dbc = [
            'VERSION ""',
            'BU_: ECU1',
            'BO_ 100 Msg: 8 ECU1',
            ' SG_ LE_Unsigned : 0|8@1+ (1,0) [0|255] "" ECU1',
            ' SG_ LE_Signed : 8|8@1- (1,0) [-128|127] "" ECU1',
            ' SG_ BE_Unsigned : 16|8@0+ (1,0) [0|255] "" ECU1',
            ' SG_ BE_Signed : 24|8@0- (1,0) [-128|127] "" ECU1',
        ].join('\n');

        test('little-endian unsigned → @1+', () => {
            const out = parseAndSerialize(dbc);
            const line = findSignalLine(out, 'LE_Unsigned');
            assert.ok(line?.includes('@1+'), `expected @1+ in: ${line}`);
        });

        test('little-endian signed → @1-', () => {
            const out = parseAndSerialize(dbc);
            const line = findSignalLine(out, 'LE_Signed');
            assert.ok(line?.includes('@1-'), `expected @1- in: ${line}`);
        });

        test('big-endian unsigned → @0+', () => {
            const out = parseAndSerialize(dbc);
            const line = findSignalLine(out, 'BE_Unsigned');
            assert.ok(line?.includes('@0+'), `expected @0+ in: ${line}`);
        });

        test('big-endian signed → @0-', () => {
            const out = parseAndSerialize(dbc);
            const line = findSignalLine(out, 'BE_Signed');
            assert.ok(line?.includes('@0-'), `expected @0- in: ${line}`);
        });
    });

    suite('signal factor and offset formatting', () => {
        test('integer factor serialized without decimal point', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ Val : 0|8@1+ (1,0) [0|255] "" ECU1',
            ].join('\n'));
            const line = findSignalLine(out, 'Val');
            assert.ok(line?.includes('(1,0)'), `expected (1,0) in: ${line}`);
        });

        test('decimal factor preserved', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ RPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECU1',
            ].join('\n'));
            const line = findSignalLine(out, 'RPM');
            assert.ok(line?.includes('(0.25,0)'), `expected (0.25,0) in: ${line}`);
        });

        test('negative offset preserved', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ Temp : 0|8@1+ (1,-40) [-40|215] "degC" ECU1',
            ].join('\n'));
            const line = findSignalLine(out, 'Temp');
            assert.ok(line?.includes('(1,-40)'), `expected (1,-40) in: ${line}`);
        });
    });

    suite('receiving nodes', () => {
        test('single receiving node serialized without trailing comma', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1 ECU2',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ Val : 0|8@1+ (1,0) [0|255] "" ECU2',
            ].join('\n'));
            const line = findSignalLine(out, 'Val');
            assert.ok(line?.endsWith('ECU2'), `expected ECU2 at end in: ${line}`);
        });

        test('multiple receiving nodes joined with comma', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1 ECU2 GW',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ Speed : 0|16@1+ (1,0) [0|255] "" ECU2,GW',
            ].join('\n'));
            const line = findSignalLine(out, 'Speed');
            assert.ok(line?.endsWith('ECU2,GW'), `expected ECU2,GW in: ${line}`);
        });

        test('no receiving nodes → Vector__XXX', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 8 ECU1',
                ' SG_ RPM : 0|16@1+ (1,0) [0|255] "" ',
            ].join('\n'));
            const line = findSignalLine(out, 'RPM');
            assert.ok(line?.endsWith('Vector__XXX'), `expected Vector__XXX in: ${line}`);
        });
    });

    suite('multiplexing notation', () => {
        const muxDbc = [
            'VERSION ""',
            'BU_: ECU1',
            'BO_ 500 GearboxStatus: 8 ECU1',
            ' SG_ GearSelector M : 0|4@1+ (1,0) [0|15] "" ECU1',
            ' SG_ DriveData m0 : 4|8@1+ (1,0) [0|255] "" ECU1',
            ' SG_ ReverseData m1 : 4|8@1+ (1,0) [0|255] "" ECU1',
            ' SG_ Regular : 20|8@1+ (1,0) [0|255] "" ECU1',
        ].join('\n');

        test('multiplexor signal has " M " token in serialized output', () => {
            const out = parseAndSerialize(muxDbc);
            const line = findSignalLine(out, 'GearSelector');
            assert.ok(line?.includes(' M :'), `expected " M :" in: ${line}`);
        });

        test('multiplexed m0 signal has " m0 " token in serialized output', () => {
            const out = parseAndSerialize(muxDbc);
            const line = findSignalLine(out, 'DriveData');
            assert.ok(line?.includes(' m0 :'), `expected " m0 :" in: ${line}`);
        });

        test('multiplexed m1 signal has " m1 " token in serialized output', () => {
            const out = parseAndSerialize(muxDbc);
            const line = findSignalLine(out, 'ReverseData');
            assert.ok(line?.includes(' m1 :'), `expected " m1 :" in: ${line}`);
        });

        test('regular signal has no mux token (goes directly to ":")', () => {
            const out = parseAndSerialize(muxDbc);
            const line = findSignalLine(out, 'Regular');
            // Should be "SG_ Regular : ..." not "SG_ Regular M :" or "SG_ Regular m0 :"
            assert.ok(line?.match(/SG_\s+Regular\s+:/), `expected no mux token in: ${line}`);
        });
    });

    suite('VAL_ serialization', () => {
        test('VAL_ entries emitted in ascending key order', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 4 ECU1',
                ' SG_ Gear : 0|4@1+ (1,0) [0|15] "" ECU1',
                'VAL_ 100 Gear 3 "Drive" 0 "Park" 1 "Reverse" 2 "Neutral" ;',
            ].join('\n'));
            const valLine = out.split('\n').find((l) => l.startsWith('VAL_ 100 Gear'));
            assert.ok(valLine, 'VAL_ line must be emitted');
            const idx0 = valLine!.indexOf('"Park"');
            const idx1 = valLine!.indexOf('"Reverse"');
            const idx2 = valLine!.indexOf('"Neutral"');
            const idx3 = valLine!.indexOf('"Drive"');
            assert.ok(idx0 < idx1 && idx1 < idx2 && idx2 < idx3, 'entries must be in ascending order');
        });

        test('signal without VAL_ entries emits no VAL_ line', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BO_ 100 Msg: 4 ECU1',
                ' SG_ RPM : 0|16@1+ (1,0) [0|255] "" ECU1',
            ].join('\n'));
            assert.ok(!out.includes('VAL_ 100 RPM'), 'no VAL_ line for signal without descriptions');
        });
    });

    suite('BA_DEF_ ENUM serialization', () => {
        test('ENUM values are quoted in BA_DEF_ line', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BU_: ECU1',
                'BA_DEF_ BO_ "SystemClass" ENUM "Class_A","Class_B","Class_C";',
                'BA_DEF_DEF_ "SystemClass" "Class_A";',
            ].join('\n'));
            const defLine = out.split('\n').find((l) => l.includes('"SystemClass"') && l.startsWith('BA_DEF_'));
            assert.ok(defLine, 'BA_DEF_ line must exist');
            assert.ok(defLine!.includes('"Class_A"'), 'Class_A must be quoted');
            assert.ok(defLine!.includes('"Class_B"'), 'Class_B must be quoted');
            assert.ok(defLine!.includes('"Class_C"'), 'Class_C must be quoted');
        });
    });

    suite('message transmitter', () => {
        test('no transmitting node → Vector__XXX in BO_ line', () => {
            const out = parseAndSerialize([
                'VERSION ""',
                'BO_ 100 Msg: 8 Vector__XXX',
                ' SG_ Val : 0|8@1+ (1,0) [0|255] "" Vector__XXX',
            ].join('\n'));
            const boLine = out.split('\n').find((l) => l.startsWith('BO_ 100'));
            assert.ok(boLine?.includes('Vector__XXX'), `expected Vector__XXX in: ${boLine}`);
        });
    });
});
