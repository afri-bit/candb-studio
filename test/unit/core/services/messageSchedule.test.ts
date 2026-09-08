import * as assert from 'assert';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { DbcSerializer } from '../../../../src/infrastructure/parsers/dbc/DbcSerializer';
import {
    ensureScheduleDefinitions,
    readMessageSchedule,
    scheduleErrors,
    writeMessageSchedule,
    type MessageSchedule,
} from '../../../../src/core/models/database/messageSchedule';
const schedule: MessageSchedule = {
    sendType: 'cyclic',
    cycleTimeMs: 20,
    sourceNetwork: 'drive.dbc',
    forwardNetwork: 'telemetry.dbc',
    forwardNode: 'Gateway',
    forwardRateMode: 'derated',
    forwardFrequencyHz: 10,
};
suite('DBC message scheduling attributes', () => {
    test('schema defaults do not invent a message send type', () => {
        const db = new CanDatabase();
        ensureScheduleDefinitions(db);
        ensureScheduleDefinitions(db);
        assert.strictEqual(db.attributeDefinitions.length, 7);
        assert.strictEqual(readMessageSchedule(db, 1).sendType, '');
        assert.ok(scheduleErrors(readMessageSchedule(db, 1)).length);
    });
    test('complete schedule and forwarding survive DBC save and reopen', () => {
        const db = new CanDatabase({ messages: [new Message({ id: 1, name: 'Status', dlc: 8 })] });
        writeMessageSchedule(db, 1, schedule);
        const text = new DbcSerializer().serialize(db);
        assert.ok(text.includes('BA_DEF_ BO_ "GenMsgSendType" ENUM'));
        assert.ok(text.includes('BA_ "LHRForwardNetwork" BO_ 1 "telemetry.dbc";'));
        assert.deepStrictEqual(readMessageSchedule(new DbcParser().parse(text), 1), schedule);
    });
    test('existing enum order is respected', () => {
        const db = new DbcParser().parse(
            'VERSION ""\nBA_DEF_ BO_ "GenMsgSendType" ENUM "Trigger","Cyclic";\nBA_DEF_DEF_ "GenMsgSendType" "Trigger";\nBO_ 1 Status: 8 ECU\n',
        );
        writeMessageSchedule(db, 1, schedule);
        assert.strictEqual(
            db.attributes.find((a) => a.definitionName === 'GenMsgSendType')?.value,
            1,
        );
        assert.deepStrictEqual(readMessageSchedule(db, 1), schedule);
    });
    test('invalid edits do not replace the existing schedule', () => {
        const db = new CanDatabase();
        writeMessageSchedule(db, 1, schedule);
        for (const changes of [
            { cycleTimeMs: 0 },
            { forwardFrequencyHz: 100 },
            { forwardNode: '' },
            { forwardNetwork: 'drive.dbc' },
            { sendType: '' },
        ]) {
            assert.throws(() => writeMessageSchedule(db, 1, { ...schedule, ...changes }));
            assert.deepStrictEqual(readMessageSchedule(db, 1), schedule);
        }
    });
    test('trigger send type requires no cycle time', () => {
        assert.deepStrictEqual(
            scheduleErrors({
                ...schedule,
                sendType: 'trigger',
                cycleTimeMs: 0,
                forwardNetwork: '',
            }),
            [],
        );
    });
});
