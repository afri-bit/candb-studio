import * as assert from 'assert';
import { ValidationService } from '../../../../src/application/services/ValidationService';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';
import { DiagnosticSeverity } from '../../../../src/core/types';

suite('ValidationService — CAN FD DLC checks', () => {
    let service: ValidationService;
    let db: CanDatabase;

    setup(() => {
        service = new ValidationService();
        db = new CanDatabase();
    });

    test('passes for classic CAN message with DLC = 8', () => {
        db.messages.push(new Message({ id: 0x100, name: 'Msg', dlc: 8 }));
        const diags = service.validate(db);
        const dlcErrors = diags.filter(
            (d) => d.path?.includes('dlc') && d.severity === DiagnosticSeverity.Error,
        );
        assert.strictEqual(dlcErrors.length, 0);
    });

    test('errors for classic CAN message with DLC = 9', () => {
        db.messages.push(new Message({ id: 0x100, name: 'Msg', dlc: 9 }));
        const diags = service.validate(db);
        const dlcErrors = diags.filter(
            (d) => d.path?.includes('dlc') && d.severity === DiagnosticSeverity.Error,
        );
        assert.ok(dlcErrors.length > 0, 'should error for classic DLC > 8');
    });

    test('passes for CAN FD message with DLC = 64', () => {
        db.messages.push(new Message({ id: 0x200, name: 'FdMsg', dlc: 64, isFd: true }));
        const diags = service.validate(db);
        const dlcErrors = diags.filter(
            (d) => d.path?.includes('dlc') && d.severity === DiagnosticSeverity.Error,
        );
        assert.strictEqual(dlcErrors.length, 0);
    });

    test('errors for CAN FD message with DLC > 64', () => {
        db.messages.push(new Message({ id: 0x200, name: 'FdMsg', dlc: 65, isFd: true }));
        const diags = service.validate(db);
        const dlcErrors = diags.filter(
            (d) => d.path?.includes('dlc') && d.severity === DiagnosticSeverity.Error,
        );
        assert.ok(dlcErrors.length > 0, 'should error for FD DLC > 64');
    });

    test('warns for CAN FD message with non-canonical DLC (e.g. 10)', () => {
        db.messages.push(new Message({ id: 0x200, name: 'FdMsg', dlc: 10, isFd: true }));
        const diags = service.validate(db);
        const dlcWarnings = diags.filter(
            (d) => d.path?.includes('dlc') && d.severity === DiagnosticSeverity.Warning,
        );
        assert.ok(dlcWarnings.length > 0, 'should warn for non-canonical FD DLC');
    });
});
