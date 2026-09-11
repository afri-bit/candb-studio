import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { serializeDatabaseForWebview } from '../../../../src/presentation/webview/serializeDatabaseForWebview';

const FIXTURES_DIR = path.join(__dirname, '../../../../..', 'test', 'fixtures');

suite('serializeDatabaseForWebview — value descriptions', () => {
    const dbc = fs.readFileSync(path.join(FIXTURES_DIR, 'dbc', 'val_descriptions.dbc'), 'utf-8');

    test('VAL_TABLE_ entries reach the webview descriptor', () => {
        const db = new DbcParser().parse(dbc);
        const serialized = serializeDatabaseForWebview(db);

        const gear = serialized.valueTables.find((t) => t.name === 'GearTable');
        assert.ok(gear, 'GearTable should be present');
        assert.strictEqual(gear!.entries[0], 'Park');
        assert.strictEqual(gear!.entries[4], 'Sport');
    });

    test('pool signal shows per-message VAL_ labels (round-trip display)', () => {
        const db = new DbcParser().parse(dbc);
        const serialized = serializeDatabaseForWebview(db);

        const poolGear = serialized.signalPool.find((s) => s.name === 'Gear');
        assert.ok(poolGear, 'Gear pool signal should exist');
        assert.strictEqual(poolGear!.valueDescriptions[0], 'Park');
        assert.strictEqual(poolGear!.valueDescriptions[4], 'Sport');
    });
});
