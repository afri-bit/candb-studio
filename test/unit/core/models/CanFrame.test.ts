import * as assert from 'assert';
import { CanFrame } from '../../../../src/core/models/bus/CanFrame';

suite('CanFrame', () => {
  suite('constructor', () => {
    test('stores id, data, and dlc', () => {
      const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
      const frame = new CanFrame({ id: 0x1A3, data });
      assert.strictEqual(frame.id, 0x1A3);
      assert.deepStrictEqual(frame.data, data);
      assert.strictEqual(frame.dlc, 4);
    });

    test('dlc defaults to data.length when not provided', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array(8) });
      assert.strictEqual(frame.dlc, 8);
    });

    test('explicit dlc overrides data.length', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array(8), dlc: 4 });
      assert.strictEqual(frame.dlc, 4);
    });

    test('isExtended defaults to false', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array(0) });
      assert.strictEqual(frame.isExtended, false);
    });

    test('timestamp defaults to 0', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array(0) });
      assert.strictEqual(frame.timestamp, 0);
    });

    test('accepts isExtended and timestamp overrides', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array(0), isExtended: true, timestamp: 12345 });
      assert.strictEqual(frame.isExtended, true);
      assert.strictEqual(frame.timestamp, 12345);
    });
  });

  suite('idHex', () => {
    test('formats standard ID as uppercase hex', () => {
      const frame = new CanFrame({ id: 0x1A3, data: new Uint8Array(0) });
      assert.strictEqual(frame.idHex, '0x1A3');
    });

    test('formats zero ID correctly', () => {
      const frame = new CanFrame({ id: 0, data: new Uint8Array(0) });
      assert.strictEqual(frame.idHex, '0x0');
    });

    test('formats extended 29-bit ID correctly', () => {
      const frame = new CanFrame({ id: 0x1FFFFFFF, data: new Uint8Array(0), isExtended: true });
      assert.strictEqual(frame.idHex, '0x1FFFFFFF');
    });
  });

  suite('dataHex', () => {
    test('formats single byte as padded uppercase hex', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array([0x0F]) });
      assert.strictEqual(frame.dataHex, '0F');
    });

    test('formats multiple bytes space-separated', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]) });
      assert.strictEqual(frame.dataHex, 'DE AD BE EF');
    });

    test('returns empty string for zero-length data', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array(0) });
      assert.strictEqual(frame.dataHex, '');
    });

    test('pads single-digit hex values with leading zero', () => {
      const frame = new CanFrame({ id: 1, data: new Uint8Array([0x01, 0x0A]) });
      assert.strictEqual(frame.dataHex, '01 0A');
    });
  });
});
