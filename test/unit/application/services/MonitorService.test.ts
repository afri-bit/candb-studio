import * as assert from 'assert';
import { MonitorService } from '../../../../src/application/services/MonitorService';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { CanFrame } from '../../../../src/core/models/bus/CanFrame';
import { Message } from '../../../../src/core/models/database/Message';
import { Signal } from '../../../../src/core/models/database/Signal';
import { EventBus } from '../../../../src/shared/events/EventBus';
import type { ICanBusAdapter } from '../../../../src/core/interfaces/bus/ICanBusAdapter';
import type { ISignalDecoder } from '../../../../src/core/interfaces/bus/ISignalDecoder';
import type { CanChannel } from '../../../../src/core/models/bus/CanChannel';
import type { Disposable } from '../../../../src/core/types';
import { CanBusState } from '../../../../src/core/enums/CanBusState';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { MultiplexIndicator } from '../../../../src/core/enums/MultiplexIndicator';
import { SignalDecoder } from '../../../../src/infrastructure/codec/SignalDecoder';

/** Minimal CAN bus adapter that allows test code to push frames. */
function makeAdapter(): ICanBusAdapter & { pushFrame(frame: CanFrame): void } {
  const frameCallbacks = new Set<(frame: CanFrame) => void>();
  return {
    get state() { return CanBusState.Connected; },
    async connect(_ch: CanChannel) {},
    async disconnect() {},
    async send(_f: CanFrame) {},
    onFrameReceived(cb: (f: CanFrame) => void): Disposable {
      frameCallbacks.add(cb);
      return { dispose: () => frameCallbacks.delete(cb) };
    },
    onStateChanged(_cb: (s: CanBusState) => void): Disposable { return { dispose: () => {} }; },
    onError(_cb: (e: Error) => void): Disposable { return { dispose: () => {} }; },
    pushFrame(frame: CanFrame) {
      for (const cb of frameCallbacks) { cb(frame); }
    },
  };
}

/** Signal decoder that always returns 0 (decode logic is tested separately). */
function makeNullDecoder(): ISignalDecoder {
  return { decode: (_sig, _data) => 0 };
}

suite('MonitorService', () => {
  let adapter: ReturnType<typeof makeAdapter>;
  let eventBus: EventBus;
  let service: MonitorService;

  setup(() => {
    adapter = makeAdapter();
    eventBus = new EventBus();
    service = new MonitorService(adapter, makeNullDecoder(), eventBus);
  });

  teardown(() => {
    service.stop();
  });

  suite('isRunning', () => {
    test('is false before start() is called', () => {
      assert.strictEqual(service.isRunning, false);
    });

    test('is true after start()', () => {
      service.start();
      assert.strictEqual(service.isRunning, true);
    });

    test('is false after stop()', () => {
      service.start();
      service.stop();
      assert.strictEqual(service.isRunning, false);
    });
  });

  suite('start / stop idempotency', () => {
    test('calling start() twice does not register duplicate listeners', () => {
      service.start();
      service.start();
      assert.strictEqual(service.isRunning, true);
    });

    test('calling stop() when already stopped does not throw', () => {
      assert.doesNotThrow(() => service.stop());
    });
  });

  suite('frame callbacks', () => {
    test('onFrame callback is invoked for each received frame', () => {
      const received: CanFrame[] = [];
      service.onFrame((f) => received.push(f));
      service.start();

      const frame = new CanFrame({ id: 0x100, data: new Uint8Array(8) });
      adapter.pushFrame(frame);

      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].id, 0x100);
    });

    test('frame callback is not invoked when service is stopped', () => {
      const received: CanFrame[] = [];
      service.onFrame((f) => received.push(f));
      // Never started — frames pushed to adapter should not reach the callback
      const frame = new CanFrame({ id: 0x100, data: new Uint8Array(8) });
      adapter.pushFrame(frame);
      assert.strictEqual(received.length, 0);
    });

    test('disposing the subscription removes the callback', () => {
      const received: CanFrame[] = [];
      const disposable = service.onFrame((f) => received.push(f));
      service.start();
      disposable.dispose();

      adapter.pushFrame(new CanFrame({ id: 0x100, data: new Uint8Array(8) }));
      assert.strictEqual(received.length, 0);
    });

    test('clear() removes all frame callbacks', () => {
      const received: CanFrame[] = [];
      service.onFrame((f) => received.push(f));
      service.start();
      service.clear();

      adapter.pushFrame(new CanFrame({ id: 0x100, data: new Uint8Array(8) }));
      assert.strictEqual(received.length, 0);
    });
  });

  suite('event bus emissions', () => {
    test('emits bus:frameReceived when the frame ID is not defined in the database', () => {
      const payloads: Array<{ frame: CanFrame; direction: string }> = [];
      eventBus.on('bus:frameReceived', (p) => payloads.push(p));
      service.start();

      adapter.pushFrame(new CanFrame({ id: 0x1A3, data: new Uint8Array(8) }));
      assert.strictEqual(payloads.length, 1);
      assert.strictEqual(payloads[0].frame.id, 0x1A3);
      assert.strictEqual(payloads[0].direction, 'rx');
    });

    test('classifies loopback echo as tx when frameTransmitted matches receive', () => {
      const dirs: string[] = [];
      eventBus.on('bus:frameReceived', (p) => dirs.push(p.direction));
      service.start();
      const f = new CanFrame({ id: 0x55, data: new Uint8Array([1, 2, 3, 4]) });
      eventBus.emit('bus:frameTransmitted', f);
      adapter.pushFrame(new CanFrame({ id: 0x55, data: new Uint8Array([1, 2, 3, 4]) }));
      assert.strictEqual(dirs.length, 1);
      assert.strictEqual(dirs[0], 'tx');
    });

    test('emits bus:messageDecoded when the frame ID matches a database message', () => {
      const database = new CanDatabase();
      database.signalPool.push(new Signal({ name: 'RPM', startBit: 0, bitLength: 16 }));
      const msg = new Message({ id: 0x100, name: 'EngineStatus', dlc: 8 });
      msg.addSignalRef({
        signalName: 'RPM',
        startBit: 0,
        bitLength: 16,
        byteOrder: ByteOrder.LittleEndian,
      });
      database.addMessage(msg);

      service.setDatabase(database);
      service.start();

      let decodedCount = 0;
      let rawCount = 0;
      let lastDecodedDirection = '';
      eventBus.on('bus:messageDecoded', (p) => {
        decodedCount++;
        lastDecodedDirection = p.direction;
      });
      eventBus.on('bus:frameReceived', () => { rawCount++; });

      adapter.pushFrame(new CanFrame({ id: 0x100, data: new Uint8Array(8) }));
      assert.strictEqual(decodedCount, 1);
      assert.strictEqual(rawCount, 0);
      assert.strictEqual(lastDecodedDirection, 'rx');
    });

    test('decodes an extended frame (marker-free id) against a DB message stored with the 0x80000000 marker', () => {
      const database = new CanDatabase();
      database.signalPool.push(new Signal({ name: 'EngineSpeed', startBit: 0, bitLength: 16 }));
      // 0x8CF004FE == 0x0CF004FE | 0x80000000 (extended marker kept in the data layer).
      const msg = new Message({ id: 0x8cf004fe, name: 'EEC1', dlc: 8 });
      msg.addSignalRef({
        signalName: 'EngineSpeed',
        startBit: 0,
        bitLength: 16,
        byteOrder: ByteOrder.LittleEndian,
      });
      database.addMessage(msg);

      service.setDatabase(database);
      service.start();

      let decodedName = '';
      let rawCount = 0;
      eventBus.on('bus:messageDecoded', (p) => { decodedName = p.decoded.message.name; });
      eventBus.on('bus:frameReceived', () => { rawCount++; });

      // Bus frame carries the marker-free arbitration id + extended flag.
      adapter.pushFrame(
        new CanFrame({ id: 0x0cf004fe, data: new Uint8Array(8), isExtended: true }),
      );
      assert.strictEqual(decodedName, 'EEC1');
      assert.strictEqual(rawCount, 0);
    });

    test('does not emit bus:messageDecoded for unknown frame IDs', () => {
      service.setDatabase(new CanDatabase()); // empty database
      service.start();

      let decodedCount = 0;
      eventBus.on('bus:messageDecoded', () => { decodedCount++; });

      adapter.pushFrame(new CanFrame({ id: 0xDEAD, data: new Uint8Array(8) }));
      assert.strictEqual(decodedCount, 0);
    });
  });

  suite('setDatabase', () => {
    test('updating the database mid-run takes effect for subsequent frames', () => {
      service.start();

      const db = new CanDatabase();
      db.addMessage(new Message({ id: 0x200, name: 'BrakeStatus', dlc: 4 }));
      service.setDatabase(db);

      let decodedCount = 0;
      eventBus.on('bus:messageDecoded', () => { decodedCount++; });

      adapter.pushFrame(new CanFrame({ id: 0x200, data: new Uint8Array(4) }));
      assert.strictEqual(decodedCount, 1);
    });

    test('setDatabase(null) unlinks decode and emits frameReceived for IDs that were previously decoded', () => {
      const database = new CanDatabase();
      database.signalPool.push(new Signal({ name: 'RPM', startBit: 0, bitLength: 16 }));
      const msg = new Message({ id: 0x100, name: 'EngineStatus', dlc: 8 });
      msg.addSignalRef({
        signalName: 'RPM',
        startBit: 0,
        bitLength: 16,
        byteOrder: ByteOrder.LittleEndian,
      });
      database.addMessage(msg);
      service.setDatabase(database);
      service.start();

      let decoded = 0;
      let raw = 0;
      eventBus.on('bus:messageDecoded', () => { decoded++; });
      eventBus.on('bus:frameReceived', () => { raw++; });

      adapter.pushFrame(new CanFrame({ id: 0x100, data: new Uint8Array(8) }));
      assert.strictEqual(decoded, 1);
      assert.strictEqual(raw, 0);

      service.setDatabase(null);
      adapter.pushFrame(new CanFrame({ id: 0x100, data: new Uint8Array(8) }));
      assert.strictEqual(decoded, 1);
      assert.strictEqual(raw, 1);
    });
  });

  suite('multiplexing', () => {
    /** Build a message mirroring test/fixtures/dbc/multiplexed.dbc (GearboxStatus, id 500). */
    function makeMultiplexedDatabase(): CanDatabase {
      const database = new CanDatabase();
      database.signalPool.push(
        new Signal({
          name: 'GearSelector',
          startBit: 0,
          bitLength: 4,
          multiplexIndicator: MultiplexIndicator.Multiplexor,
        }),
        new Signal({
          name: 'DriveData',
          startBit: 4,
          bitLength: 8,
          multiplexIndicator: MultiplexIndicator.MultiplexedSignal,
          multiplexValue: 0,
        }),
        new Signal({
          name: 'ReverseData',
          startBit: 4,
          bitLength: 8,
          multiplexIndicator: MultiplexIndicator.MultiplexedSignal,
          multiplexValue: 1,
        }),
        new Signal({
          name: 'NeutralFlag',
          startBit: 12,
          bitLength: 1,
          multiplexIndicator: MultiplexIndicator.MultiplexedSignal,
          multiplexValue: 2,
        }),
      );
      const msg = new Message({ id: 500, name: 'GearboxStatus', dlc: 8 });
      for (const s of database.signalPool) {
        msg.addSignalRef({
          signalName: s.name,
          startBit: s.startBit,
          bitLength: s.bitLength,
          byteOrder: ByteOrder.LittleEndian,
        });
      }
      database.addMessage(msg);
      return database;
    }

    /** Capture the decoded signal-value map for one pushed frame. */
    function decodeFrame(data: Uint8Array): Map<string, number> {
      const database = makeMultiplexedDatabase();
      const realService = new MonitorService(adapter, new SignalDecoder(), eventBus, database);
      let values = new Map<string, number>();
      eventBus.on('bus:messageDecoded', (p) => { values = p.decoded.signalValues; });
      realService.start();
      adapter.pushFrame(new CanFrame({ id: 500, data }));
      realService.stop();
      return values;
    }

    test('includes only the multiplexed signal matching the selector (GearSelector=0)', () => {
      // byte0 low nibble = selector (0), byte0 high nibble + byte1 low = DriveData payload
      const values = decodeFrame(new Uint8Array([0x50, 0x00, 0, 0, 0, 0, 0, 0]));
      assert.strictEqual(values.has('GearSelector'), true);
      assert.strictEqual(values.get('GearSelector'), 0);
      assert.strictEqual(values.has('DriveData'), true);
      assert.strictEqual(values.get('DriveData'), 5);
      assert.strictEqual(values.has('ReverseData'), false);
      assert.strictEqual(values.has('NeutralFlag'), false);
    });

    test('includes only the multiplexed signal matching the selector (GearSelector=1)', () => {
      const values = decodeFrame(new Uint8Array([0x71, 0x00, 0, 0, 0, 0, 0, 0]));
      assert.strictEqual(values.get('GearSelector'), 1);
      assert.strictEqual(values.has('ReverseData'), true);
      assert.strictEqual(values.get('ReverseData'), 7);
      assert.strictEqual(values.has('DriveData'), false);
      assert.strictEqual(values.has('NeutralFlag'), false);
    });

    test('includes only the multiplexed signal matching the selector (GearSelector=2)', () => {
      // selector=2 (byte0 low nibble); NeutralFlag is bit 12 (byte1 bit4)
      const values = decodeFrame(new Uint8Array([0x02, 0x10, 0, 0, 0, 0, 0, 0]));
      assert.strictEqual(values.get('GearSelector'), 2);
      assert.strictEqual(values.has('NeutralFlag'), true);
      assert.strictEqual(values.get('NeutralFlag'), 1);
      assert.strictEqual(values.has('DriveData'), false);
      assert.strictEqual(values.has('ReverseData'), false);
    });

    test('excludes all multiplexed signals when the selector matches no group', () => {
      const values = decodeFrame(new Uint8Array([0x0F, 0x00, 0, 0, 0, 0, 0, 0]));
      assert.strictEqual(values.get('GearSelector'), 15);
      assert.strictEqual(values.has('DriveData'), false);
      assert.strictEqual(values.has('ReverseData'), false);
      assert.strictEqual(values.has('NeutralFlag'), false);
    });
  });
});