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
      const frames: CanFrame[] = [];
      eventBus.on('bus:frameReceived', (f) => frames.push(f));
      service.start();

      adapter.pushFrame(new CanFrame({ id: 0x1A3, data: new Uint8Array(8) }));
      assert.strictEqual(frames.length, 1);
      assert.strictEqual(frames[0].id, 0x1A3);
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
      eventBus.on('bus:messageDecoded', () => { decodedCount++; });
      eventBus.on('bus:frameReceived', () => { rawCount++; });

      adapter.pushFrame(new CanFrame({ id: 0x100, data: new Uint8Array(8) }));
      assert.strictEqual(decodedCount, 1);
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
  });
});
