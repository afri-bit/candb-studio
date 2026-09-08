import * as assert from 'assert';
import {
    multiplexErrors,
    multiplexSignalsCanCoexist,
    type MultiplexSignal,
} from '../../../../src/core/services/multiplex';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { DbcSerializer } from '../../../../src/infrastructure/parsers/dbc/DbcSerializer';
const selector: MultiplexSignal = {
    name: 'Switch',
    multiplex: 'multiplexor',
    bitLength: 4,
    isSigned: false,
    valueType: 'integer',
};
const a: MultiplexSignal = { ...selector, name: 'A', multiplex: 0 };
const b: MultiplexSignal = { ...selector, name: 'B', multiplex: 1 };
suite('Multiplex detection and round trip', () => {
    test('detects unsupported extended multiplexing before it can be lost on save', () => {
        assert.throws(
            () =>
                new DbcParser().parse(
                    'BO_ 1 Msg: 8 ECU\n SG_ Nested m1M : 0|4@1+ (1,0) [0|15] \"\" ECU',
                ),
            /Extended multiplexing/,
        );
        assert.throws(
            () => new DbcParser().parse('SG_MUL_VAL_ 1 Value Switch 0-3;'),
            /Extended multiplexing/,
        );
    });
    test('different branches may share bits; same branch and always-present signals may not', () => {
        assert.strictEqual(multiplexSignalsCanCoexist(a, b, [selector, a, b]), false);
        assert.strictEqual(
            multiplexSignalsCanCoexist(a, { ...b, multiplex: 0 }, [selector, a]),
            true,
        );
        assert.strictEqual(
            multiplexSignalsCanCoexist(a, { ...b, multiplex: 'none' }, [selector, a]),
            true,
        );
        assert.strictEqual(multiplexSignalsCanCoexist(a, b, [a, b]), true);
    });
    test('detects missing selectors, multiple selectors and invalid raw values', () => {
        assert.ok(multiplexErrors([a]).length);
        assert.ok(multiplexErrors([selector, { ...selector, name: 'Other' }]).length);
        assert.ok(multiplexErrors([selector, { ...a, multiplex: 16 }]).length);
        assert.deepStrictEqual(multiplexErrors([selector, a, b]), []);
    });
    test('same-named signals retain distinct multiplex roles per message after save', () => {
        const text =
            'VERSION ""\nBO_ 1 One: 8 ECU\n SG_ Switch M : 0|4@1+ (1,0) [0|15] "" ECU\n SG_ Value m0 : 8|8@1+ (1,0) [0|255] "" ECU\n\nBO_ 2 Two: 8 ECU\n SG_ Switch M : 0|4@1+ (1,0) [0|15] "" ECU\n SG_ Value m1 : 8|8@1+ (1,0) [0|255] "" ECU\n';
        const db = new DbcParser().parse(text);
        const reopened = new DbcParser().parse(new DbcSerializer().serialize(db));
        assert.strictEqual(
            reopened.messages[0].findSignalByName('Value', reopened.signalPool, reopened)
                ?.multiplexValue,
            0,
        );
        assert.strictEqual(
            reopened.messages[1].findSignalByName('Value', reopened.signalPool, reopened)
                ?.multiplexValue,
            1,
        );
    });
});
