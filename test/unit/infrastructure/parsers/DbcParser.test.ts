import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { ParseError } from '../../../../src/shared/errors/ParseError';

const FIXTURES_DIR = path.join(__dirname, '../../../fixtures');

suite('DbcParser', () => {
  let parser: DbcParser;

  setup(() => {
    parser = new DbcParser();
  });

  suite('supportedExtensions', () => {
    test('includes .dbc', () => {
      assert.ok(parser.supportedExtensions.includes('.dbc'));
    });
  });

  suite('parse — minimal valid DBC', () => {
    const minimal = `VERSION "1.0"\n\nBU_: ECU1 ECU2\n`;

    test('parses VERSION correctly', () => {
      const db = parser.parse(minimal);
      assert.strictEqual(db.version, '1.0');
    });

    test('parses BU_ node list', () => {
      const db = parser.parse(minimal);
      assert.ok(db.findNodeByName('ECU1'), 'ECU1 should exist');
      assert.ok(db.findNodeByName('ECU2'), 'ECU2 should exist');
    });
  });

  suite('parse — messages and signals', () => {
    const dbc = [
      'VERSION ""',
      '',
      'BU_: ECU1',
      '',
      'BO_ 100 EngineStatus: 8 ECU1',
      ' SG_ RPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECU1',
      ' SG_ Temperature : 16|8@1+ (0.5,-40) [-40|87.5] "degC" ECU1',
      '',
    ].join('\n');

    test('parses message ID, name, and DLC', () => {
      const db = parser.parse(dbc);
      const msg = db.findMessageById(100);
      assert.ok(msg, 'message 100 should exist');
      assert.strictEqual(msg!.name, 'EngineStatus');
      assert.strictEqual(msg!.dlc, 8);
    });

    test('parses transmitting node', () => {
      const db = parser.parse(dbc);
      assert.strictEqual(db.findMessageById(100)!.transmittingNode, 'ECU1');
    });

    test('parses all signals in a message', () => {
      const db = parser.parse(dbc);
      const msg = db.findMessageById(100)!;
      assert.strictEqual(msg.signalRefs.length, 2);
    });

    test('parses signal startBit and bitLength', () => {
      const db = parser.parse(dbc);
      const rpm = db.findMessageById(100)!.findSignalByName('RPM', db.signalPool, db);
      assert.ok(rpm, 'RPM signal should exist');
      assert.strictEqual(rpm!.startBit, 0);
      assert.strictEqual(rpm!.bitLength, 16);
    });

    test('parses signal factor and offset', () => {
      const db = parser.parse(dbc);
      const rpm = db.findMessageById(100)!.findSignalByName('RPM', db.signalPool, db)!;
      assert.strictEqual(rpm.factor, 0.25);
      assert.strictEqual(rpm.offset, 0);
    });

    test('parses signal unit', () => {
      const db = parser.parse(dbc);
      const rpm = db.findMessageById(100)!.findSignalByName('RPM', db.signalPool, db)!;
      assert.strictEqual(rpm.unit, 'rpm');
    });
  });

  suite('parse — fixture file', () => {
    test('parses sample.dbc without throwing', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.dbc'), 'utf-8');
      assert.doesNotThrow(() => parser.parse(content));
    });

    test('sample.dbc yields correct message count', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.dbc'), 'utf-8');
      const db = parser.parse(content);
      assert.strictEqual(db.messages.length, 3);
    });

    test('sample.dbc yields correct node names', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.dbc'), 'utf-8');
      const db = parser.parse(content);
      assert.ok(db.findNodeByName('ECU1'));
      assert.ok(db.findNodeByName('ECU2'));
    });
  });

  suite('parse — VAL_TABLE_', () => {
    test('parses empty VAL_TABLE_ (name only)', () => {
      const dbc = ['VERSION ""', '', 'BU_: N', '', 'VAL_TABLE_ EmptyTable ;', ''].join('\n');
      const db = parser.parse(dbc);
      const vt = db.findValueTableByName('EmptyTable');
      assert.ok(vt, 'EmptyTable should exist');
      assert.strictEqual(vt!.entries.size, 0);
    });

    test('parses VAL_TABLE_ with pairs', () => {
      const dbc = ['VERSION ""', '', 'VAL_TABLE_ T 0 "Off" 1 "On" ;', ''].join('\n');
      const db = parser.parse(dbc);
      const vt = db.findValueTableByName('T');
      assert.ok(vt);
      assert.strictEqual(vt!.entries.get(0), 'Off');
      assert.strictEqual(vt!.entries.get(1), 'On');
    });

    test('parses CM_ VAL_TABLE_ comment', () => {
      const dbc = [
        'VERSION ""',
        '',
        'CM_ VAL_TABLE_ T "Gear positions"',
        'VAL_TABLE_ T 0 "N" 1 "D" ;',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      const vt = db.findValueTableByName('T');
      assert.ok(vt);
      assert.strictEqual(vt!.comment, 'Gear positions');
    });
  });

  suite('parse — empty and whitespace input', () => {
    test('returns empty database for empty string', () => {
      const db = parser.parse('');
      assert.strictEqual(db.messages.length, 0);
      assert.strictEqual(db.nodes.length, 0);
    });

    test('returns empty database for whitespace-only input', () => {
      const db = parser.parse('   \n   \n');
      assert.strictEqual(db.messages.length, 0);
    });
  });

  suite('parse — duplicate IDs are skipped silently', () => {
    const dupDbc = [
      'VERSION ""',
      '',
      'BO_ 100 Msg1: 8 Vector__XXX',
      '',
      'BO_ 100 Msg1Dup: 8 Vector__XXX',
      '',
    ].join('\n');

    test('does not throw on duplicate message ID', () => {
      assert.doesNotThrow(() => parser.parse(dupDbc));
    });

    test('keeps only the first message with a given ID', () => {
      const db = parser.parse(dupDbc);
      assert.strictEqual(db.findMessageById(100)!.name, 'Msg1');
    });
  });
});
