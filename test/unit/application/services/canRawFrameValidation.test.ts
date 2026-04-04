import * as assert from 'assert';
import { validateCanRawFrame } from '../../../../src/application/services/canRawFrameValidation';

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
