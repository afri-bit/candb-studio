import * as assert from 'assert';
import { validateDbcAlignedInjection } from '../../../../src/application/services/virtualBusInjectionValidation';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';

suite('virtualBusInjectionValidation (FR-006)', () => {
    test('rejects when database is null', () => {
        const r = validateDbcAlignedInjection(0x100, new Uint8Array([0]), null);
        assert.strictEqual(r.ok, false);
        if (!r.ok) {
            assert.strictEqual(r.code, 'NO_DATABASE');
        }
    });

    test('rejects unknown CAN id', () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x200, name: 'M', dlc: 2 }));
        const r = validateDbcAlignedInjection(0x100, new Uint8Array([0, 0]), db);
        assert.strictEqual(r.ok, false);
        if (!r.ok) {
            assert.strictEqual(r.code, 'UNKNOWN_MESSAGE');
        }
    });

    test('rejects DLC mismatch', () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x200, name: 'M', dlc: 4 }));
        const r = validateDbcAlignedInjection(0x200, new Uint8Array([1, 2]), db);
        assert.strictEqual(r.ok, false);
        if (!r.ok) {
            assert.strictEqual(r.code, 'DLC_MISMATCH');
        }
    });

    test('accepts valid payload', () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x200, name: 'M', dlc: 2 }));
        const r = validateDbcAlignedInjection(0x200, new Uint8Array([1, 2]), db);
        assert.strictEqual(r.ok, true);
    });
});
