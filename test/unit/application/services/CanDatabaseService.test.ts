import * as assert from 'assert';
import * as vscode from 'vscode';
import { pathToFileURL } from 'url';
import { CanDatabaseService } from '../../../../src/application/services/CanDatabaseService';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';
import { Node } from '../../../../src/core/models/database/Node';
import { EventBus } from '../../../../src/shared/events/EventBus';
import type { ICanDatabaseRepository } from '../../../../src/core/interfaces/database/ICanDatabaseRepository';
import type { IValidationService } from '../../../../src/core/interfaces/database/IValidationService';
import { DiagnosticSeverity } from '../../../../src/core/types';
import type { DiagnosticItem } from '../../../../src/core/types';
import { ObjectType } from '../../../../src/core/enums/ObjectType';
import { AttributeValueType } from '../../../../src/core/enums/AttributeValueType';

/** Minimal in-memory repository stub. */
function makeRepository(initial?: CanDatabase): ICanDatabaseRepository {
  let stored: CanDatabase = initial ?? new CanDatabase();
  return {
    async load(_path: string) { return stored; },
    parseContent(_content: string, _ext: string) { return stored; },
    serializeContent(db: CanDatabase, _ext: string) { return `VERSION ""\n${db.messages.length}`; },
    async save(_path: string, db: CanDatabase) { stored = db; },
    async exists(_path: string) { return true; },
  };
}

/** Validation service that returns no findings. */
function makeNullValidator(): IValidationService {
  return { validate(_db: CanDatabase): DiagnosticItem[] { return []; } };
}

suite('CanDatabaseService', () => {
  let eventBus: EventBus;
  let service: CanDatabaseService;

  setup(() => {
    eventBus = new EventBus();
    const repo = makeRepository();
    service = new CanDatabaseService(repo, makeNullValidator(), eventBus);
  });

  suite('getDatabase', () => {
    test('returns null before any database is loaded', () => {
      assert.strictEqual(service.getDatabase(), null);
    });
  });

  suite('load', () => {
    test('returns the loaded CanDatabase', async () => {
      const db = await service.load('/fake/path.dbc');
      assert.ok(db instanceof CanDatabase);
    });

    test('getDatabase returns the loaded instance after load', async () => {
      const db = await service.load('/fake/path.dbc');
      assert.strictEqual(service.getDatabase(), db);
    });

    test('emits database:loaded event after load', async () => {
      let emitted = false;
      eventBus.on('database:loaded', () => { emitted = true; });
      await service.load('/fake/path.dbc');
      assert.strictEqual(emitted, true);
    });
  });

  suite('active bus database URI', () => {
    test('after load, getActiveBusDatabaseUri and getDatabaseForBus match the session', async () => {
      const db = await service.load('/fake/path.dbc');
      const uri = pathToFileURL('/fake/path.dbc').href;
      assert.strictEqual(service.getActiveBusDatabaseUri(), uri);
      assert.strictEqual(service.getDatabaseForBus(), db);
      assert.deepStrictEqual(service.getSessionUris(), [uri]);
    });

    test('setActiveBusDatabaseUri switches between loaded sessions', async () => {
      await service.load('/fake/a.dbc');
      await service.load('/fake/b.dbc');
      const uris = service.getSessionUris();
      assert.strictEqual(uris.length, 2);
      service.setActiveBusDatabaseUri(uris[0]);
      assert.strictEqual(service.getActiveBusDatabaseUri(), uris[0]);
      assert.strictEqual(service.getDatabaseForBus(), service.getDatabase(uris[0]));
      service.setActiveBusDatabaseUri(uris[1]);
      assert.strictEqual(service.getActiveBusDatabaseUri(), uris[1]);
    });

    test('setActiveBusDatabaseUri rejects URI that is not a session', async () => {
      await service.load('/fake/path.dbc');
      assert.throws(
        () => service.setActiveBusDatabaseUri('file:///no/such.dbc'),
        /loaded session/,
      );
    });

    test('emits bus:activeDatabaseUriChanged when active URI changes', async () => {
      const seen: Array<string | null> = [];
      eventBus.on('bus:activeDatabaseUriChanged', (p) => { seen.push(p.uri); });
      await service.load('/fake/a.dbc');
      await service.load('/fake/b.dbc');
      const uris = service.getSessionUris();
      service.setActiveBusDatabaseUri(uris[0]);
      assert.ok(seen.includes(uris[0]));
    });
  });

  suite('save', () => {
    test('throws when no database is loaded', async () => {
      await assert.rejects(() => service.save(), /No database loaded/);
    });

    test('emits database:saved event on success', async () => {
      await service.load('/fake/path.dbc');
      let savedUri: string | undefined;
      eventBus.on('database:saved', (payload) => { savedUri = payload.uri; });
      await service.save();
      assert.strictEqual(savedUri, pathToFileURL('/fake/path.dbc').href);
    });
  });

  suite('saveAs', () => {
    test('throws when no database is loaded', async () => {
      await assert.rejects(() => service.saveAs('/new/path.dbc'), /No database loaded/);
    });

    test('emits database:saved with the new path', async () => {
      await service.load('/old/path.dbc');
      let savedUri: string | undefined;
      eventBus.on('database:saved', (payload) => { savedUri = payload.uri; });
      await service.saveAs('/new/path.dbc');
      assert.strictEqual(savedUri, pathToFileURL('/new/path.dbc').href);
    });
  });

  suite('validate', () => {
    test('returns empty array when no database is loaded', () => {
      assert.deepStrictEqual(service.validate(), []);
    });

    test('delegates to the validation service when a database is loaded', async () => {
      const repo = makeRepository();
      const diagnostics: DiagnosticItem[] = [{ message: 'test error', severity: DiagnosticSeverity.Error }];
      const strictValidator: IValidationService = { validate: () => diagnostics };
      const svc = new CanDatabaseService(repo, strictValidator, new EventBus());
      await svc.load('/fake/path.dbc');
      assert.deepStrictEqual(svc.validate(), diagnostics);
    });
  });

  suite('addMessage', () => {
    test('adds a message to the current database', async () => {
      await service.load('/fake/path.dbc');
      service.addMessage(new Message({ id: 0x100, name: 'TestMsg', dlc: 8 }));
      assert.ok(service.getDatabase()!.findMessageById(0x100));
    });

    test('emits database:changed after adding a message', async () => {
      await service.load('/fake/path.dbc');
      let changed = false;
      eventBus.on('database:changed', () => { changed = true; });
      service.addMessage(new Message({ id: 0x200, name: 'AnotherMsg', dlc: 4 }));
      assert.strictEqual(changed, true);
    });

    test('throws when no database is loaded', () => {
      assert.throws(
        () => service.addMessage(new Message({ id: 1, name: 'Msg', dlc: 8 })),
        /No database loaded/,
      );
    });
  });

  suite('removeMessage', () => {
    test('removes an existing message and returns true', async () => {
      await service.load('/fake/path.dbc');
      service.addMessage(new Message({ id: 0x100, name: 'Msg', dlc: 8 }));
      assert.strictEqual(service.removeMessage(0x100), true);
      assert.strictEqual(service.getDatabase()!.findMessageById(0x100), undefined);
    });

    test('returns false for a non-existent message ID', async () => {
      await service.load('/fake/path.dbc');
      assert.strictEqual(service.removeMessage(0xDEAD), false);
    });

    test('emits database:changed only when a message is actually removed', async () => {
      await service.load('/fake/path.dbc');
      service.addMessage(new Message({ id: 0x100, name: 'Msg', dlc: 8 }));
      let changeCount = 0;
      eventBus.on('database:changed', () => { changeCount++; });
      service.removeMessage(0x100);
      service.removeMessage(0xDEAD);
      assert.strictEqual(changeCount, 1);
    });
  });

  suite('addNode / removeNode', () => {
    test('addNode adds a node to the database', async () => {
      await service.load('/fake/path.dbc');
      service.addNode(new Node('ECU1'));
      assert.ok(service.getDatabase()!.findNodeByName('ECU1'));
    });

    test('removeNode removes a node and returns true', async () => {
      await service.load('/fake/path.dbc');
      service.addNode(new Node('ECU1'));
      assert.strictEqual(service.removeNode('ECU1'), true);
      assert.strictEqual(service.getDatabase()!.findNodeByName('ECU1'), undefined);
    });

    test('removeNode returns false for non-existent node', async () => {
      await service.load('/fake/path.dbc');
      assert.strictEqual(service.removeNode('Ghost'), false);
    });
  });

  suite('updateMessage', () => {
    test('setting transmitter to a new name adds a matching node', async () => {
      await service.load('/fake/path.dbc');
      const uri = vscode.Uri.file('/fake/path.dbc').toString();
      service.addMessage(new Message({ id: 0x100, name: 'TestMsg', dlc: 8 }));
      service.updateMessage(uri, 0x100, { transmitter: 'NewECU' });
      const db = service.getDatabase()!;
      assert.strictEqual(db.findMessageById(0x100)!.transmittingNode, 'NewECU');
      assert.ok(db.findNodeByName('NewECU'));
    });

    test('setting transmitter to an existing node does not duplicate the node', async () => {
      await service.load('/fake/path.dbc');
      const uri = vscode.Uri.file('/fake/path.dbc').toString();
      service.addNode(new Node('Existing'));
      service.addMessage(new Message({ id: 0x200, name: 'M2', dlc: 8 }));
      service.updateMessage(uri, 0x200, { transmitter: 'Existing' });
      assert.strictEqual(service.getDatabase()!.nodes.filter((n) => n.name === 'Existing').length, 1);
    });
  });

  suite('updatePoolSignal', () => {
    test('propagates layout fields to every message ref for that signal', async () => {
      await service.load('/fake/path.dbc');
      const uri = vscode.Uri.file('/fake/path.dbc').toString();
      const poolInput = {
        name: 'S1',
        startBit: 0,
        bitLength: 8,
        byteOrder: 'little_endian' as const,
        isSigned: false,
        factor: 1,
        offset: 0,
        minimum: 0,
        maximum: 255,
        unit: '',
        receivers: [] as string[],
        valueType: 'integer' as const,
        multiplex: 'none' as const,
        comment: '',
        valueDescriptions: {} as Record<number, string>,
        valueTableName: '',
      };
      service.addPoolSignal(uri, poolInput);
      service.addMessage(new Message({ id: 0x100, name: 'M1', dlc: 8 }));
      service.addMessage(new Message({ id: 0x200, name: 'M2', dlc: 8 }));
      service.linkSignalToMessage(uri, 0x100, 'S1');
      service.linkSignalToMessage(uri, 0x200, 'S1');
      service.updateSignal(uri, 0x100, 'S1', { startBit: 10 });
      const db = service.getDatabase()!;
      assert.strictEqual(db.findMessageById(0x100)!.findSignalRefByName('S1')!.startBit, 10);
      assert.strictEqual(db.findPoolSignalByName('S1')!.startBit, 0);
      service.updatePoolSignal(uri, 'S1', { startBit: 4, bitLength: 16 });
      assert.strictEqual(db.findPoolSignalByName('S1')!.startBit, 4);
      assert.strictEqual(db.findPoolSignalByName('S1')!.bitLength, 16);
      assert.strictEqual(db.findMessageById(0x100)!.findSignalRefByName('S1')!.startBit, 4);
      assert.strictEqual(db.findMessageById(0x200)!.findSignalRefByName('S1')!.startBit, 4);
      assert.strictEqual(db.findMessageById(0x100)!.findSignalRefByName('S1')!.bitLength, 16);
    });

    test('linkSignalToMessage accepts optional startBit for frame placement', async () => {
      await service.load('/fake/path.dbc');
      const uri = vscode.Uri.file('/fake/path.dbc').toString();
      const poolInput = {
        name: 'S2',
        startBit: 0,
        bitLength: 8,
        byteOrder: 'little_endian' as const,
        isSigned: false,
        factor: 1,
        offset: 0,
        minimum: 0,
        maximum: 255,
        unit: '',
        receivers: [] as string[],
        valueType: 'integer' as const,
        multiplex: 'none' as const,
        comment: '',
        valueDescriptions: {} as Record<number, string>,
        valueTableName: '',
      };
      service.addPoolSignal(uri, poolInput);
      service.addMessage(new Message({ id: 0x300, name: 'M3', dlc: 8 }));
      service.linkSignalToMessage(uri, 0x300, 'S2', { startBit: 15 });
      const ref = service.getDatabase()!.findMessageById(0x300)!.findSignalRefByName('S2')!;
      assert.strictEqual(ref.startBit, 15);
      assert.strictEqual(ref.bitLength, 8);
    });

    test('applies receivers from comma-separated string', async () => {
      await service.load('/fake/path.dbc');
      const uri = vscode.Uri.file('/fake/path.dbc').toString();
      service.addPoolSignal(uri, {
        name: 'R1',
        startBit: 0,
        bitLength: 8,
        byteOrder: 'little_endian',
        isSigned: false,
        factor: 1,
        offset: 0,
        minimum: 0,
        maximum: 255,
        unit: '',
        receivers: [],
        valueType: 'integer',
        multiplex: 'none',
        comment: '',
        valueDescriptions: {},
        valueTableName: '',
      });
      service.updatePoolSignal(uri, 'R1', { receivers: 'ECU_A, ECU_B' });
      const recv = service.getDatabase()!.findPoolSignalByName('R1')!.receivingNodes;
      assert.deepStrictEqual(recv, ['ECU_A', 'ECU_B']);
    });
  });

  suite('addAttributeDefinition', () => {
    test('appends unique New_AttrDef_n definitions with defaults', async () => {
      await service.load('/fake/path.dbc');
      const uri = vscode.Uri.file('/fake/path.dbc').toString();
      service.addAttributeDefinition(uri);
      const db = service.getDatabase()!;
      assert.strictEqual(db.attributeDefinitions.length, 1);
      const a0 = db.attributeDefinitions[0];
      assert.strictEqual(a0.name, 'New_AttrDef_0');
      assert.strictEqual(a0.objectType, ObjectType.Message);
      assert.strictEqual(a0.valueType, AttributeValueType.Integer);
      assert.strictEqual(a0.defaultValue, 0);
      assert.strictEqual(a0.minimum, 0);
      assert.strictEqual(a0.maximum, 0);

      service.addAttributeDefinition(uri);
      assert.strictEqual(db.attributeDefinitions.length, 2);
      assert.strictEqual(db.attributeDefinitions[1].name, 'New_AttrDef_1');
    });
  });
});
