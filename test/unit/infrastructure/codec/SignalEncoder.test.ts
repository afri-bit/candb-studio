import * as assert from 'assert';
import { SignalEncoder } from '../../../../src/infrastructure/codec/SignalEncoder';
import { Signal } from '../../../../src/core/models/database/Signal';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';

suite('SignalEncoder', () => {
  let encoder: SignalEncoder;

  setup(() => {
    encoder = new SignalEncoder();
  });

  function makeSignal(params: {
    startBit: number;
    bitLength: number;
    factor?: number;
    offset?: number;
    byteOrder?: ByteOrder;
  }): Signal {
    return new Signal({
      name: 'TestSignal',
      startBit: params.startBit,
      bitLength: params.bitLength,
      factor: params.factor ?? 1,
      offset: params.offset ?? 0,
      byteOrder: params.byteOrder ?? ByteOrder.LittleEndian,
    });
  }

  suite('little-endian (Intel byte order)', () => {
    test('encodes a single-byte value at bit 0', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const result = encoder.encode(sig, 0xAB, new Uint8Array(8));
      assert.strictEqual(result[0], 0xAB);
    });

    test('encodes zero correctly', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const result = encoder.encode(sig, 0, new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]));
      assert.strictEqual(result[0], 0x00);
    });

    test('encodes a 16-bit value spanning two bytes', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 16 });
      const result = encoder.encode(sig, 0x0102, new Uint8Array(8));
      assert.strictEqual(result[0], 0x02);
      assert.strictEqual(result[1], 0x01);
    });

    test('encodes value at non-zero start bit', () => {
      const sig = makeSignal({ startBit: 8, bitLength: 8 });
      const result = encoder.encode(sig, 0x5A, new Uint8Array(8));
      assert.strictEqual(result[0], 0x00, 'byte 0 should be untouched');
      assert.strictEqual(result[1], 0x5A, 'byte 1 should hold the value');
    });

    test('applies factor scaling before encoding', () => {
      // physical=100, factor=0.5 → raw=200
      const sig = makeSignal({ startBit: 0, bitLength: 16, factor: 0.5 });
      const result = encoder.encode(sig, 100, new Uint8Array(8));
      const raw = result[0] | (result[1] << 8);
      assert.strictEqual(raw, 200);
    });

    test('applies offset before encoding', () => {
      // physical=25, factor=1, offset=-40 → raw=65
      const sig = makeSignal({ startBit: 0, bitLength: 8, factor: 1, offset: -40 });
      const result = encoder.encode(sig, 25, new Uint8Array(8));
      assert.strictEqual(result[0], 65);
    });

    test('does not modify bytes outside the signal bit range', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const initial = new Uint8Array([0x00, 0xAA, 0xBB, 0xCC, 0x00, 0x00, 0x00, 0x00]);
      const result = encoder.encode(sig, 0xFF, initial);
      assert.strictEqual(result[1], 0xAA, 'byte 1 unchanged');
      assert.strictEqual(result[2], 0xBB, 'byte 2 unchanged');
      assert.strictEqual(result[3], 0xCC, 'byte 3 unchanged');
    });

    test('encode result is a new Uint8Array (does not mutate input)', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const original = new Uint8Array(8);
      const result = encoder.encode(sig, 0xFF, original);
      assert.notStrictEqual(result, original);
      assert.strictEqual(original[0], 0x00, 'original should be unchanged');
    });
  });

  suite('big-endian (Motorola byte order) — stub', () => {
    test('encode does not throw for Motorola signals', () => {
      const sig = makeSignal({ startBit: 7, bitLength: 8, byteOrder: ByteOrder.BigEndian });
      // TODO: assert correct byte-level output once Motorola encoding is implemented
      assert.doesNotThrow(() => encoder.encode(sig, 42, new Uint8Array(8)));
    });
  });
});
