import * as assert from 'assert';
import {
    validateCanFdRawFrame,
    validateCanRawFrame,
} from '../../../../src/application/services/canRawFrameValidation';

suite('canRawFrameValidation', () => {
    test('accepts standard ID and matching DLC', () => {
        const r = validateCanRawFrame(0x123, new Uint8Array([1, 2, 3]), 3, false);
        assert.strictEqual(r.ok, true);
    });

    test('rejects standard ID > 11-bit', () => {
        const r = validateCanRawFrame(0x800, new Uint8Array([0]), 1, false);
        assert.strictEqual(r.ok, false);
    });

    test('allows 29-bit range when extended', () => {
        const r = validateCanRawFrame(0x18ff1234, new Uint8Array(8), 8, true);
        assert.strictEqual(r.ok, true);
    });

    test('rejects DLC vs payload length', () => {
        const r = validateCanRawFrame(0x1, new Uint8Array([1, 2]), 1, false);
        assert.strictEqual(r.ok, false);
    });
});

suite('validateCanFdRawFrame', () => {
    test('accepts valid FD frame — 64-byte payload', () => {
        const r = validateCanFdRawFrame(0x100, new Uint8Array(64), 64, false, true);
        assert.strictEqual(r.ok, true);
    });

    test('accepts valid FD frame — 8-byte payload', () => {
        const r = validateCanFdRawFrame(0x100, new Uint8Array(8), 8, false, false);
        assert.strictEqual(r.ok, true);
    });

    test('rejects non-canonical FD payload size (e.g. 10 bytes)', () => {
        const r = validateCanFdRawFrame(0x100, new Uint8Array(10), 10, false, true);
        assert.strictEqual(r.ok, false);
        assert.ok('code' in r && r.code === 'FD_INVALID_PAYLOAD_SIZE');
    });

    test('rejects payload length mismatch', () => {
        const r = validateCanFdRawFrame(0x100, new Uint8Array(8), 12, false, true);
        assert.strictEqual(r.ok, false);
        assert.ok('code' in r && r.code === 'DLC_PAYLOAD');
    });

    test('rejects standard ID out of 11-bit range', () => {
        const r = validateCanFdRawFrame(0x800, new Uint8Array(8), 8, false, true);
        assert.strictEqual(r.ok, false);
        assert.ok('code' in r && r.code === 'ID_STANDARD_RANGE');
    });
});
