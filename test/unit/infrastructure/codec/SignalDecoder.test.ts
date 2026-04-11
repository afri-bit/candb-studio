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

  suite('big-endian (Motorola byte order)', () => {
    test('decodes a 1-bit Motorola signal', () => {
      // startBit=7 (bit7 of byte0, the MSB) — reads the most significant bit of byte 0
      const sig = makeSignal({ startBit: 7, bitLength: 1, byteOrder: ByteOrder.BigEndian });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x80, 0x00])), 1);
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x7F, 0x00])), 0);
    });

    test('decodes an 8-bit Motorola signal spanning one byte (startBit=7)', () => {
      // MSB at bit7(byte0), traverses 6,5,4,3,2,1,0 → entire byte 0
      const sig = makeSignal({ startBit: 7, bitLength: 8, byteOrder: ByteOrder.BigEndian });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0xAB, 0x00])), 0xAB);
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x00, 0x00])), 0);
    });

    test('decodes a 16-bit Motorola signal (known vector: [0x01,0x02] → 0x0102)', () => {
      // startBit=7, bitLength=16: MSB at bit7(byte0), then bits 6..0, then bit15..8(byte1)
      const sig = makeSignal({ startBit: 7, bitLength: 16, byteOrder: ByteOrder.BigEndian });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x01, 0x02])), 0x0102);
    });

    test('decodes a 16-bit Motorola signal (all ones → 65535)', () => {
      const sig = makeSignal({ startBit: 7, bitLength: 16, byteOrder: ByteOrder.BigEndian });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0xFF, 0xFF])), 65535);
    });

    test('decodes signed Motorola signal (0xFF → -1)', () => {
      const sig = makeSignal({
        startBit: 7,
        bitLength: 8,
        byteOrder: ByteOrder.BigEndian,
        valueType: SignalValueType.Signed,
      });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0xFF, 0x00])), -1);
    });

    test('decodes a cross-byte 4-bit Motorola signal (startBit=14, bitLength=4)', () => {
      // DBC bit 14 = byte 1, local bit 6 (MSB of our 4-bit signal).
      // Bits traverse: 14, 13, 12, 11 → all in byte 1.
      // byte1 = 0xF0 → bits [7,6,5,4,3,2,1,0] → bits 14,13,12,11 are bits 6,5,4,3 → 0b1111 = 15
      const sig = makeSignal({ startBit: 14, bitLength: 4, byteOrder: ByteOrder.BigEndian });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x00, 0x78, 0x00])), 15);
      // byte1 = 0x08 → bit 3 only → 0b0001 = 1
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x00, 0x08, 0x00])), 1);
    });

    test('decodes a 16-bit Motorola signal with factor and offset', () => {
      // raw = 0x0102 = 258, factor = 0.5, offset = 10 → physical = 258 * 0.5 + 10 = 139
      const sig = makeSignal({ startBit: 7, bitLength: 16, byteOrder: ByteOrder.BigEndian, factor: 0.5, offset: 10 });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x01, 0x02])), 139);
    });

    test('decodes a 16-bit signed Motorola signal with negative value', () => {
      // 0x8000 = 32768 unsigned; as signed 16-bit = -32768
      const sig = makeSignal({
        startBit: 7,
        bitLength: 16,
        byteOrder: ByteOrder.BigEndian,
        valueType: SignalValueType.Signed,
      });
      assert.strictEqual(decoder.decode(sig, new Uint8Array([0x80, 0x00])), -32768);
    });
  });

  suite('CAN FD — signals wider than 32 bits (BigInt path)', () => {
    test('decodes a 40-bit little-endian signal in a 64-byte FD frame', () => {
      // Signal occupies bits 0–39 (5 bytes), value = 0x1234567890
      const sig = makeSignal({ startBit: 0, bitLength: 40 });
      const data = new Uint8Array(64);
      // Write 0x1234567890 little-endian at offset 0
      data[0] = 0x90;
      data[1] = 0x78;
      data[2] = 0x56;
      data[3] = 0x34;
      data[4] = 0x12;
      assert.strictEqual(decoder.decode(sig, data), 0x1234567890);
    });

    test('decodes a 33-bit little-endian signal (just above 32-bit threshold)', () => {
      // Value = 2^32 + 1 = 4294967297
      const sig = makeSignal({ startBit: 0, bitLength: 33 });
      const data = new Uint8Array(64);
      // 4294967297 = 0x1_0000_0001 little-endian: [0x01, 0x00, 0x00, 0x00, 0x01]
      data[0] = 0x01;
      data[4] = 0x01;
      assert.strictEqual(decoder.decode(sig, data), 4294967297);
    });

    test('decodes a 40-bit big-endian signal in a 64-byte FD frame', () => {
      // In Motorola DBC, startBit is the position of the MSB. For a 40-bit signal spanning
      // bytes 0–4 MSB-first, the MSB is at DBC bit 7 (byte 0, bit 7).
      // Value = 0x0102030405 big-endian: bytes [0x01, 0x02, 0x03, 0x04, 0x05].
      const sig = makeSignal({ startBit: 7, bitLength: 40, byteOrder: ByteOrder.BigEndian });
      const data = new Uint8Array(64);
      data[0] = 0x01;
      data[1] = 0x02;
      data[2] = 0x03;
      data[3] = 0x04;
      data[4] = 0x05;
      assert.strictEqual(decoder.decode(sig, data), 0x0102030405);
    });
  });
});
