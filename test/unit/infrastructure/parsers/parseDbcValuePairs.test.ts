import * as assert from 'assert';
import { parseDbcValuePairs } from '../../../../src/infrastructure/parsers/dbc/DbcParser';

suite('parseDbcValuePairs', () => {
    test('returns empty map for empty string', () => {
        const result = parseDbcValuePairs('');
        assert.strictEqual(result.size, 0);
    });

    test('returns empty map for whitespace-only string', () => {
        const result = parseDbcValuePairs('   ');
        assert.strictEqual(result.size, 0);
    });

    test('parses single pair', () => {
        const result = parseDbcValuePairs('0 "Off"');
        assert.strictEqual(result.size, 1);
        assert.strictEqual(result.get(0), 'Off');
    });

    test('parses multiple pairs', () => {
        const result = parseDbcValuePairs('0 "Park" 1 "Reverse" 2 "Neutral" 3 "Drive"');
        assert.strictEqual(result.size, 4);
        assert.strictEqual(result.get(0), 'Park');
        assert.strictEqual(result.get(1), 'Reverse');
        assert.strictEqual(result.get(2), 'Neutral');
        assert.strictEqual(result.get(3), 'Drive');
    });

    test('parses pairs with large numeric keys', () => {
        const result = parseDbcValuePairs('255 "MaxValue" 128 "MidValue"');
        assert.strictEqual(result.get(255), 'MaxValue');
        assert.strictEqual(result.get(128), 'MidValue');
    });

    test('parses pairs with empty label', () => {
        const result = parseDbcValuePairs('0 "" 1 "Active"');
        assert.strictEqual(result.get(0), '');
        assert.strictEqual(result.get(1), 'Active');
    });

    test('parses pairs with multi-word label', () => {
        const result = parseDbcValuePairs('1 "High Speed Forward" 2 "Low Speed Reverse"');
        assert.strictEqual(result.get(1), 'High Speed Forward');
        assert.strictEqual(result.get(2), 'Low Speed Reverse');
    });

    test('ignores trailing semicolon and whitespace', () => {
        const result = parseDbcValuePairs('0 "Off" 1 "On" ;');
        assert.strictEqual(result.size, 2);
        assert.strictEqual(result.get(0), 'Off');
    });

    test('handles extra whitespace between pairs', () => {
        const result = parseDbcValuePairs('  0  "Off"   1   "On"  ');
        assert.strictEqual(result.get(0), 'Off');
        assert.strictEqual(result.get(1), 'On');
    });

    test('returns map with integer keys (not strings)', () => {
        const result = parseDbcValuePairs('7 "Sport"');
        const keys = [...result.keys()];
        assert.strictEqual(typeof keys[0], 'number');
        assert.strictEqual(keys[0], 7);
    });
});
