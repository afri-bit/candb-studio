import * as assert from 'assert';
import { SignalDecoder } from '../../../../src/infrastructure/codec/SignalDecoder';
import { Signal } from '../../../../src/core/models/database/Signal';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { SignalValueType } from '../../../../src/core/enums/SignalValueType';

suite('SignalDecoder', () => {
  let decoder: SignalDecoder;

  setup(() => {
    decoder = new SignalDecoder();
  });

  function makeSignal(params: {
    startBit: number;
    bitLength: number;
    factor?: number;
    offset?: number;
    byteOrder?: ByteOrder;
    valueType?: SignalValueType;
  }): Signal {
    return new Signal({
      name: 'TestSignal',
      startBit: params.startBit,
      bitLength: params.bitLength,
      factor: params.factor ?? 1,
      offset: params.offset ?? 0,
      byteOrder: params.byteOrder ?? ByteOrder.LittleEndian,
      valueType: params.valueType ?? SignalValueType.Unsigned,
    });
  }

  suite('little-endian (Intel byte order)', () => {
    test('decodes a single byte at bit 0', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const data = new Uint8Array([0xAB, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.strictEqual(decoder.decode(sig, data), 0xAB);
    });

    test('decodes zero correctly', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const data = new Uint8Array(8);
      assert.strictEqual(decoder.decode(sig, data), 0);
    });

    test('decodes a 16-bit little-endian value', () => {
      const sig = makeSignal({ startBit: 0, bitLength: 16 });
      const data = new Uint8Array([0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.strictEqual(decoder.decode(sig, data), 0x0102);
    });

    test('decodes signal starting at non-zero bit offset', () => {
      const sig = makeSignal({ startBit: 8, bitLength: 8 });
      const data = new Uint8Array([0x00, 0x5A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.strictEqual(decoder.decode(sig, data), 0x5A);
    });

    test('applies factor scaling after raw extraction', () => {
      // raw=200, factor=0.5 → physical=100
      const sig = makeSignal({ startBit: 0, bitLength: 16, factor: 0.5 });
      const data = new Uint8Array([0xC8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 200 LE
      assert.strictEqual(decoder.decode(sig, data), 100);
    });

    test('applies offset after factor scaling', () => {
      // raw=65, factor=1, offset=-40 → physical=25
      const sig = makeSignal({ startBit: 0, bitLength: 8, factor: 1, offset: -40 });
      const data = new Uint8Array([65, 0, 0, 0, 0, 0, 0, 0]);
      assert.strictEqual(decoder.decode(sig, data), 25);
    });

    test('handles signed negative value correctly', () => {
      // 8-bit signed: 0xFF = -1 in two's complement
      const sig = makeSignal({ startBit: 0, bitLength: 8, valueType: SignalValueType.Signed });
      const data = new Uint8Array([0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.strictEqual(decoder.decode(sig, data), -1);
    });

    test('handles signed positive value (MSB clear)', () => {
      // 8-bit signed: 0x7F = 127
      const sig = makeSignal({ startBit: 0, bitLength: 8, valueType: SignalValueType.Signed });
      const data = new Uint8Array([0x7F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.strictEqual(decoder.decode(sig, data), 127);
    });
  });

  suite('round-trip with SignalEncoder', () => {
    test('encode then decode returns original physical value (8-bit LE)', () => {
      const { SignalEncoder } = require('../../../../src/infrastructure/codec/SignalEncoder');
      const encoder = new SignalEncoder();
      const sig = makeSignal({ startBit: 0, bitLength: 8 });
      const physicalValue = 42;
      const encoded = encoder.encode(sig, physicalValue, new Uint8Array(8));
      const decoded = decoder.decode(sig, encoded);
      assert.strictEqual(decoded, physicalValue);
    });

    test('encode then decode returns original physical value (16-bit LE)', () => {
      const { SignalEncoder } = require('../../../../src/infrastructure/codec/SignalEncoder');
      const encoder = new SignalEncoder();
      const sig = makeSignal({ startBit: 0, bitLength: 16 });
      const physicalValue = 12345;
      const encoded = encoder.encode(sig, physicalValue, new Uint8Array(8));
      const decoded = decoder.decode(sig, encoded);
      assert.strictEqual(decoded, physicalValue);
    });
  });

  suite('big-endian (Motorola byte order) — stub', () => {
    test('decode does not throw for Motorola signals', () => {
      const sig = makeSignal({ startBit: 7, bitLength: 8, byteOrder: ByteOrder.BigEndian });
      // TODO: assert correct decoded value once Motorola decoding is implemented
      assert.doesNotThrow(() => decoder.decode(sig, new Uint8Array(8)));
    });
  });
});
