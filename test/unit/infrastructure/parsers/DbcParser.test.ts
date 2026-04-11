import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { DbcSerializer } from '../../../../src/infrastructure/parsers/dbc/DbcSerializer';
import { ParseError } from '../../../../src/shared/errors/ParseError';
import { ObjectType } from '../../../../src/core/enums/ObjectType';
import { AttributeValueType } from '../../../../src/core/enums/AttributeValueType';

/** Compiled tests live under `out/test/...`; fixtures stay at repo `test/fixtures`. */
const FIXTURES_DIR = path.join(__dirname, '../../../../..', 'test', 'fixtures');

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

  suite('parse — BA_DEF_ / BA_DEF_DEF_', () => {
    test('parses INT attribute definition and default', () => {
      const dbc = [
        'VERSION ""',
        '',
        'BU_: N1',
        '',
        'BA_DEF_ BO_ "MyAttr" INT 0 100;',
        'BA_DEF_DEF_ "MyAttr" 42;',
        '',
        'BO_ 1 M: 8 N1',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.strictEqual(db.attributeDefinitions.length, 1);
      const ad = db.attributeDefinitions[0];
      assert.strictEqual(ad.name, 'MyAttr');
      assert.strictEqual(ad.objectType, ObjectType.Message);
      assert.strictEqual(ad.valueType, AttributeValueType.Integer);
      assert.strictEqual(ad.minimum, 0);
      assert.strictEqual(ad.maximum, 100);
      assert.strictEqual(ad.defaultValue, 42);
    });

    test('round-trips attribute definitions through DbcSerializer', () => {
      const serializer = new DbcSerializer();
      const dbc = [
        'VERSION ""',
        '',
        'BU_: N1',
        '',
        'BA_DEF_ BO_ "Cycle" INT 0 65535;',
        'BA_DEF_DEF_ "Cycle" 100;',
        '',
        'BO_ 1 M: 8 N1',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      const text = serializer.serialize(db);
      const db2 = parser.parse(text);
      assert.strictEqual(db2.attributeDefinitions.length, 1);
      const a = db2.findAttributeDefinition('Cycle')!;
      assert.strictEqual(a.defaultValue, 100);
      assert.strictEqual(a.objectType, ObjectType.Message);
    });
  });

  suite('parse — CM_ comments', () => {
    const dbc = [
      'VERSION ""',
      '',
      'BU_: ECU1 ECU2',
      '',
      'BO_ 100 EngineStatus: 8 ECU1',
      ' SG_ RPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECU2',
      '',
      'CM_ "Network-level comment";',
      'CM_ BU_ ECU1 "Engine control unit";',
      'CM_ BO_ 100 "Engine status message";',
      'CM_ SG_ 100 RPM "Engine speed in RPM";',
      '',
    ].join('\n');

    test('parses network comment', () => {
      const db = parser.parse(dbc);
      assert.strictEqual(db.comment, 'Network-level comment');
    });

    test('parses node comment', () => {
      const db = parser.parse(dbc);
      assert.strictEqual(db.findNodeByName('ECU1')!.comment, 'Engine control unit');
    });

    test('parses message comment', () => {
      const db = parser.parse(dbc);
      assert.strictEqual(db.findMessageById(100)!.comment, 'Engine status message');
    });

    test('parses signal comment', () => {
      const db = parser.parse(dbc);
      assert.strictEqual(db.findPoolSignalByName('RPM')!.comment, 'Engine speed in RPM');
    });

    test('parses multi-line signal comment', () => {
      const multiLineDbc = [
        'VERSION ""',
        '',
        'BU_: ECU1',
        '',
        'BO_ 100 Msg: 8 ECU1',
        ' SG_ Speed : 0|8@1+ (1,0) [0|255] "kph" ECU1',
        '',
        'CM_ SG_ 100 Speed "This is a',
        'multi-line comment";',
        '',
      ].join('\n');
      const db = parser.parse(multiLineDbc);
      assert.strictEqual(db.findPoolSignalByName('Speed')!.comment, 'This is a\nmulti-line comment');
    });

    test('round-trips comments through serializer', () => {
      const serializer = new DbcSerializer();
      const db = parser.parse(dbc);
      const text = serializer.serialize(db);
      const db2 = parser.parse(text);
      assert.strictEqual(db2.comment, 'Network-level comment');
      assert.strictEqual(db2.findNodeByName('ECU1')!.comment, 'Engine control unit');
      assert.strictEqual(db2.findMessageById(100)!.comment, 'Engine status message');
      assert.strictEqual(db2.findPoolSignalByName('RPM')!.comment, 'Engine speed in RPM');
    });

    test('parses CM_ comments from sample.dbc fixture', () => {
      const fs = require('fs');
      const path = require('path');
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.dbc'), 'utf-8');
      const db = parser.parse(content);
      assert.strictEqual(db.findPoolSignalByName('RPM')!.comment, 'Engine rotational speed in RPM');
      assert.strictEqual(db.findMessageById(100)!.comment, 'Engine status message broadcast by ECU1 at 10ms cycle');
    });
  });

  suite('parse — BA_ attribute values', () => {
    const dbc = [
      'VERSION ""',
      '',
      'BU_: ECU1',
      '',
      'BA_DEF_ BO_ "GenMsgCycleTime" INT 0 65535;',
      'BA_DEF_DEF_ "GenMsgCycleTime" 0;',
      'BA_DEF_ SG_ "GenSigStartValue" FLOAT 0 0;',
      'BA_DEF_DEF_ "GenSigStartValue" 0;',
      '',
      'BO_ 100 EngineStatus: 8 ECU1',
      ' SG_ RPM : 0|16@1+ (0.25,0) [0|16383.75] "rpm" ECU1',
      '',
      'BA_ "GenMsgCycleTime" BO_ 100 10;',
      'BA_ "GenSigStartValue" SG_ 100 RPM 0.5;',
      'BA_ "GenMsgCycleTime" BU_ ECU1 50;',
      '',
    ].join('\n');

    test('parses BA_ for message (integer value)', () => {
      const db = parser.parse(dbc);
      const attr = db.attributes.find(
        (a) => a.definitionName === 'GenMsgCycleTime' && a.objectType === ObjectType.Message,
      );
      assert.ok(attr, 'message attribute should exist');
      assert.strictEqual(attr!.messageId, 100);
      assert.strictEqual(attr!.value, 10);
    });

    test('parses BA_ for signal (float value)', () => {
      const db = parser.parse(dbc);
      const attr = db.attributes.find(
        (a) => a.definitionName === 'GenSigStartValue' && a.objectType === ObjectType.Signal,
      );
      assert.ok(attr, 'signal attribute should exist');
      assert.strictEqual(attr!.messageId, 100);
      assert.strictEqual(attr!.signalName, 'RPM');
      assert.strictEqual(attr!.value, 0.5);
    });

    test('parses BA_ for node', () => {
      const db = parser.parse(dbc);
      const attr = db.attributes.find(
        (a) => a.definitionName === 'GenMsgCycleTime' && a.objectType === ObjectType.Node,
      );
      assert.ok(attr, 'node attribute should exist');
      assert.strictEqual(attr!.objectName, 'ECU1');
      assert.strictEqual(attr!.value, 50);
    });

    test('round-trips BA_ attribute values through serializer', () => {
      const serializer = new DbcSerializer();
      const db = parser.parse(dbc);
      const text = serializer.serialize(db);
      const db2 = parser.parse(text);
      const msgAttr = db2.attributes.find(
        (a) => a.definitionName === 'GenMsgCycleTime' && a.objectType === ObjectType.Message,
      );
      assert.ok(msgAttr);
      assert.strictEqual(msgAttr!.value, 10);
      assert.strictEqual(msgAttr!.messageId, 100);
    });

    test('parses BA_ with string value', () => {
      const strDbc = [
        'VERSION ""',
        'BU_: N1',
        'BA_DEF_ BO_ "SystemMessageLongSymbol" STRING ;',
        'BA_DEF_DEF_ "SystemMessageLongSymbol" "";',
        'BO_ 1 M: 8 N1',
        'BA_ "SystemMessageLongSymbol" BO_ 1 "MyLongMessageName";',
      ].join('\n');
      const db = parser.parse(strDbc);
      const attr = db.attributes.find((a) => a.definitionName === 'SystemMessageLongSymbol');
      assert.ok(attr);
      assert.strictEqual(attr!.value, 'MyLongMessageName');
    });
  });

  suite('parse — malformed CM_ does not swallow BO_ blocks', () => {
    test('messages after an unterminated CM_ are still parsed', () => {
      // CM_ with no closing `";` — the boundary guard must stop before BO_ 200
      const dbc = [
        'VERSION ""',
        '',
        'BO_ 100 Msg1: 8 Vector__XXX',
        ' SG_ Speed : 0|8@1+ (1,0) [0|255] "kph" Vector__XXX',
        '',
        'CM_ SG_ 100 Speed "This comment has no terminator',
        '',
        'BO_ 200 Msg2: 8 Vector__XXX',
        ' SG_ Temp : 0|8@1+ (1,0) [0|255] "degC" Vector__XXX',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.ok(db.findMessageById(100), 'Msg1 should be parsed');
      assert.ok(db.findMessageById(200), 'Msg2 after malformed CM_ should be parsed');
      assert.strictEqual(db.messages.length, 2);
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

  suite('CAN FD — VFrameFormat BA_ attribute', () => {
    const fdDbc = [
      'VERSION ""',
      '',
      'BU_: ECU1',
      '',
      'BO_ 100 ClassicMsg: 8 ECU1',
      ' SG_ Speed : 0|16@1+ (1,0) [0|0] "kph" ECU1',
      '',
      'BO_ 200 FdMsg: 64 ECU1',
      ' SG_ Counter : 0|32@1+ (1,0) [0|0] "" ECU1',
      '',
      'BA_DEF_ BO_ "VFrameFormat" ENUM "StandardCAN","ExtendedCAN","StandardCAN_FD","ExtendedCAN_FD";',
      'BA_DEF_DEF_ "VFrameFormat" "StandardCAN";',
      'BA_ "VFrameFormat" BO_ 200 2;',
      '',
    ].join('\n');

    test('sets isFd = true on FD message', () => {
      const db = parser.parse(fdDbc);
      const fdMsg = db.findMessageById(200);
      assert.ok(fdMsg, 'FD message should be found');
      assert.strictEqual(fdMsg!.isFd, true);
    });

    test('leaves isFd = false on classic message', () => {
      const db = parser.parse(fdDbc);
      const classicMsg = db.findMessageById(100);
      assert.ok(classicMsg, 'classic message should be found');
      assert.strictEqual(classicMsg!.isFd, false);
    });

    test('round-trips isFd through serializer and re-parse', () => {
      const serializer = new DbcSerializer();
      const db = parser.parse(fdDbc);
      const serialized = serializer.serialize(db);
      const db2 = parser.parse(serialized);
      assert.strictEqual(db2.findMessageById(200)!.isFd, true, 'FD flag must survive round-trip');
      assert.strictEqual(db2.findMessageById(100)!.isFd, false, 'classic flag must survive round-trip');
    });

    test('serializer does not double-emit VFrameFormat BA_ lines', () => {
      const serializer = new DbcSerializer();
      const db = parser.parse(fdDbc);
      const serialized = serializer.serialize(db);
      const count = (serialized.match(/BA_ "VFrameFormat"/g) ?? []).length;
      assert.strictEqual(count, 1, 'exactly one VFrameFormat BA_ line should be emitted');
    });

    test('preserves vendor VFrameFormat enum index (e.g. Kvaser index 14) on round-trip', () => {
      // Kvaser uses a 16-value VFrameFormat enum; StandardCAN_FD is at index 14, not 2.
      const dbc = [
        'VERSION ""',
        'BU_:',
        'BO_ 100 FdMsg: 16 Vector__XXX',
        'BA_DEF_ BO_ "VFrameFormat" ENUM "StandardCAN","ExtendedCAN","r","r","r","r","r","r","r","r","r","r","r","r","StandardCAN_FD","ExtendedCAN_FD";',
        'BA_DEF_DEF_ "VFrameFormat" "StandardCAN";',
        'BA_ "VFrameFormat" BO_ 100 14;',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.strictEqual(db.findMessageById(100)!.isFd, true, 'isFd must be set');
      const serializer = new DbcSerializer();
      const text = serializer.serialize(db);
      assert.ok(text.includes('BA_ "VFrameFormat" BO_ 100 14'), 'original index 14 must be preserved, not rewritten to 2');
    });

    test('accepts VFrameFormat index ≥ 2 (tolerant of tool variations)', () => {
      const altFdDbc = [
        'VERSION ""',
        'BU_:',
        'BO_ 300 AnotherFd: 32 Vector__XXX',
        'BA_DEF_ BO_ "VFrameFormat" ENUM "A","B","C","D";',
        'BA_DEF_DEF_ "VFrameFormat" "A";',
        'BA_ "VFrameFormat" BO_ 300 3;',
      ].join('\n');
      const db = parser.parse(altFdDbc);
      assert.strictEqual(db.findMessageById(300)!.isFd, true);
    });
  });

  suite('parse — unknown/unsupported DBC sections (round-trip passthrough)', () => {
    let serializer: DbcSerializer;

    setup(() => {
      serializer = new DbcSerializer();
    });

    test('preserves NS_ block with symbol names through round-trip', () => {
      const dbc = [
        'VERSION ""',
        '',
        'NS_ :',
        '   NS_DESC_',
        '   CM_',
        '',
        'BS_:',
        '',
        'BU_:',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.ok(db.nsContent, 'nsContent should be populated');
      assert.ok(db.nsContent!.includes('NS_DESC_'), 'nsContent should contain symbol names');
      const text = serializer.serialize(db);
      assert.ok(text.includes('NS_DESC_'), 'serialized output should contain NS_ symbols');
    });

    test('uses default NS_ : when nsContent is null (files without NS_ block)', () => {
      const db = parser.parse('VERSION ""\n\nBU_:\n');
      assert.strictEqual(db.nsContent, null);
      const text = serializer.serialize(db);
      assert.ok(text.includes('NS_ :'), 'fallback NS_ : should be emitted');
    });

    test('survives EV_ section through parse → serialize → parse', () => {
      const dbc = [
        'VERSION ""',
        '',
        'NS_ :',
        '',
        'BS_:',
        '',
        'BU_: ECU1',
        '',
        'BO_ 100 Msg: 8 ECU1',
        ' SG_ Speed : 0|8@1+ (1,0) [0|255] "kph" ECU1',
        '',
        'EV_ EnvVar1 : 0 [0,100] "" 0 0 DUMMY_NODE_VECTOR0 ECU1;',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.strictEqual(db.rawUnknownSections.length, 1, 'EV_ section should be captured');
      assert.ok(db.rawUnknownSections[0].startsWith('EV_'), 'captured block should start with EV_');

      const text = serializer.serialize(db);
      assert.ok(text.includes('EV_'), 'serialized output must contain EV_ section');

      const db2 = parser.parse(text);
      assert.strictEqual(db2.rawUnknownSections.length, 1, 'EV_ should survive re-parse');
      assert.ok(db2.rawUnknownSections[0].startsWith('EV_'));
    });

    test('survives SIG_GROUP_ section through parse → serialize → parse', () => {
      const dbc = [
        'VERSION ""',
        '',
        'NS_ :',
        '',
        'BS_:',
        '',
        'BU_: ECU1',
        '',
        'BO_ 100 Msg: 8 ECU1',
        ' SG_ Speed : 0|8@1+ (1,0) [0|255] "kph" ECU1',
        ' SG_ Temp  : 8|8@1+ (1,0) [0|255] "degC" ECU1',
        '',
        'SIG_GROUP_ 100 Group1 1 : Speed Temp;',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.strictEqual(db.rawUnknownSections.length, 1, 'SIG_GROUP_ section should be captured');
      assert.ok(db.rawUnknownSections[0].startsWith('SIG_GROUP_'));

      const text = serializer.serialize(db);
      assert.ok(text.includes('SIG_GROUP_'), 'serialized output must contain SIG_GROUP_');

      const db2 = parser.parse(text);
      assert.strictEqual(db2.rawUnknownSections.length, 1, 'SIG_GROUP_ must survive re-parse');
    });

    test('preserves multiple unknown sections in order', () => {
      const dbc = [
        'VERSION ""',
        '',
        'NS_ :',
        '',
        'BS_:',
        '',
        'BU_:',
        '',
        'EV_ EnvVar1 : 0 [0,100] "" 0 0 DUMMY_NODE_VECTOR0;',
        '',
        'BO_TX_BU_ 100 : ECU1;',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.strictEqual(db.rawUnknownSections.length, 2, 'both EV_ and BO_TX_BU_ should be captured');
      assert.ok(db.rawUnknownSections[0].startsWith('EV_'));
      assert.ok(db.rawUnknownSections[1].startsWith('BO_TX_BU_'));

      const text = serializer.serialize(db);
      const db2 = parser.parse(text);
      assert.strictEqual(db2.rawUnknownSections.length, 2, 'section count must be stable after round-trip');
    });

    test('parses network-level BA_DEF_ (no scope prefix) and round-trips it', () => {
      // Tools like Kvaser emit: BA_DEF_  "BusType" STRING ;  (no BU_/BO_/SG_/EV_ scope)
      const dbc = [
        'VERSION ""',
        '',
        'NS_ :',
        '',
        'BS_:',
        '',
        'BU_:',
        '',
        'BA_DEF_  "BusType" STRING ;',
        'BA_DEF_DEF_  "BusType" "";',
        '',
        'BA_ "BusType" "CAN FD";',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      const busDef = db.findAttributeDefinition('BusType');
      assert.ok(busDef, 'BusType BA_DEF_ must be parsed');
      assert.strictEqual(busDef!.objectType, ObjectType.Network, 'must be Network scope');

      const text = serializer.serialize(db);
      assert.ok(text.includes('BA_DEF_ "BusType" STRING'), 'serialized BA_DEF_ must have no scope prefix');
      assert.ok(text.includes('BA_ "BusType" "CAN FD"'), 'BA_ value must be preserved');

      const db2 = parser.parse(text);
      assert.ok(db2.findAttributeDefinition('BusType'), 'BusType must survive round-trip');
    });

    test('known sections (BO_, CM_) still parse correctly alongside unknown sections', () => {
      const dbc = [
        'VERSION ""',
        '',
        'NS_ :',
        '',
        'BS_:',
        '',
        'BU_: ECU1',
        '',
        'BO_ 100 Msg: 8 ECU1',
        ' SG_ Speed : 0|8@1+ (1,0) [0|255] "kph" ECU1',
        '',
        'EV_ MyEnv : 0 [0,100] "" 0 0 DUMMY_NODE_VECTOR0;',
        '',
        'CM_ BO_ 100 "Test message";',
        '',
      ].join('\n');
      const db = parser.parse(dbc);
      assert.ok(db.findMessageById(100), 'BO_ must still parse');
      assert.strictEqual(db.findMessageById(100)!.comment, 'Test message', 'CM_ must still parse');
      assert.strictEqual(db.rawUnknownSections.length, 1, 'EV_ must be captured');
    });
  });
});
