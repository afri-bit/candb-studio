import * as assert from 'assert';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';
import { Signal } from '../../../../src/core/models/database/Signal';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { MultiplexIndicator } from '../../../../src/core/enums/MultiplexIndicator';

suite('Message', () => {
  function emptyDb(): CanDatabase {
    return new CanDatabase();
  }

  function makeSignal(name: string): Signal {
    return new Signal({ name, startBit: 0, bitLength: 8 });
  }

  suite('constructor', () => {
    test('creates message with required fields', () => {
      const msg = new Message({ id: 0x100, name: 'EngineStatus', dlc: 8 });
      assert.strictEqual(msg.id, 0x100);
      assert.strictEqual(msg.name, 'EngineStatus');
      assert.strictEqual(msg.dlc, 8);
    });

    test('defaults transmittingNode to empty string', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 4 });
      assert.strictEqual(msg.transmittingNode, '');
    });

    test('defaults signalRefs to empty array', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 4 });
      assert.deepStrictEqual(msg.signalRefs, []);
    });

    test('accepts pre-populated signal refs', () => {
      const msg = new Message({
        id: 1,
        name: 'Msg',
        dlc: 8,
        signalRefs: [
          { signalName: 'Speed', startBit: 0, bitLength: 8, byteOrder: ByteOrder.LittleEndian },
        ],
      });
      assert.strictEqual(msg.signalRefs.length, 1);
    });

    test('accepts transmittingNode and comment', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8, transmittingNode: 'ECU1', comment: 'test' });
      assert.strictEqual(msg.transmittingNode, 'ECU1');
      assert.strictEqual(msg.comment, 'test');
    });
  });

  suite('addSignalRef', () => {
    test('adds a reference to the message', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      msg.addSignalRef({
        signalName: 'RPM',
        startBit: 0,
        bitLength: 8,
        byteOrder: ByteOrder.LittleEndian,
      });
      assert.strictEqual(msg.signalRefs.length, 1);
      assert.strictEqual(msg.signalRefs[0].signalName, 'RPM');
    });

    test('throws when adding a duplicate signal name', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      msg.addSignalRef({
        signalName: 'RPM',
        startBit: 0,
        bitLength: 8,
        byteOrder: ByteOrder.LittleEndian,
      });
      assert.throws(
        () =>
          msg.addSignalRef({
            signalName: 'RPM',
            startBit: 8,
            bitLength: 8,
            byteOrder: ByteOrder.LittleEndian,
          }),
        /already linked/,
      );
    });
  });

  suite('removeSignalRef', () => {
    test('removes a link and returns true', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      msg.addSignalRef({
        signalName: 'RPM',
        startBit: 0,
        bitLength: 8,
        byteOrder: ByteOrder.LittleEndian,
      });
      assert.strictEqual(msg.removeSignalRef('RPM'), true);
      assert.strictEqual(msg.signalRefs.length, 0);
    });

    test('returns false when signal is not linked', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      assert.strictEqual(msg.removeSignalRef('NonExistent'), false);
    });
  });

  suite('findSignalByName', () => {
    test('returns resolved signal when ref and pool match', () => {
      const pool = [makeSignal('Temp')];
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      msg.addSignalRef({
        signalName: 'Temp',
        startBit: 0,
        bitLength: 8,
        byteOrder: ByteOrder.LittleEndian,
      });
      const s = msg.findSignalByName('Temp', pool, emptyDb());
      assert.ok(s);
      assert.strictEqual(s!.name, 'Temp');
    });

    test('returns undefined when not linked', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      assert.strictEqual(msg.findSignalByName('Missing', [], emptyDb()), undefined);
    });
  });

  suite('computed properties', () => {
    test('totalBits equals dlc × 8', () => {
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      assert.strictEqual(msg.totalBits, 64);
    });

    test('idHex formats the ID as uppercase hex', () => {
      const msg = new Message({ id: 0x1a3, name: 'Msg', dlc: 8 });
      assert.strictEqual(msg.idHex, '0x1A3');
    });

    test('isMultiplexed is false when no multiplexor signal exists', () => {
      const pool = [makeSignal('Plain')];
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      msg.addSignalRef({
        signalName: 'Plain',
        startBit: 0,
        bitLength: 8,
        byteOrder: ByteOrder.LittleEndian,
      });
      assert.strictEqual(msg.isMultiplexed(pool, emptyDb()), false);
    });

    test('isMultiplexed is true when a multiplexor signal is present', () => {
      const muxSig = new Signal({
        name: 'Mux',
        startBit: 0,
        bitLength: 4,
        byteOrder: ByteOrder.LittleEndian,
        multiplexIndicator: MultiplexIndicator.Multiplexor,
      });
      const pool = [muxSig];
      const msg = new Message({ id: 1, name: 'Msg', dlc: 8 });
      msg.addSignalRef({
        signalName: 'Mux',
        startBit: 0,
        bitLength: 4,
        byteOrder: ByteOrder.LittleEndian,
      });
      assert.strictEqual(msg.isMultiplexed(pool, emptyDb()), true);
    });
  });
});
