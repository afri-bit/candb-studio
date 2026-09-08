import * as assert from 'assert';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';
import { Signal } from '../../../../src/core/models/database/Signal';
import { ValueTable } from '../../../../src/core/models/database/ValueTable';
import {
    mergeEffectiveValueDescriptions,
    mergeEffectiveValueDescriptionsForPoolOnly,
} from '../../../../src/core/models/database/valueDescriptionMerge';

suite('mergeEffectiveValueDescriptionsForPoolOnly', () => {
    function poolSignal(name: string, valueDescriptions?: Map<number, string>): Signal {
        return new Signal({
            name,
            startBit: 0,
            bitLength: 8,
            valueDescriptions: valueDescriptions ?? new Map(),
        });
    }

    function linkMessage(
        db: CanDatabase,
        id: number,
        name: string,
        signalName: string,
    ): Message {
        const msg = new Message({
            id,
            name,
            dlc: 8,
            signalRefs: [
                {
                    signalName,
                    startBit: 0,
                    bitLength: 8,
                    byteOrder: ByteOrder.LittleEndian,
                },
            ],
        });
        db.addMessage(msg);
        return msg;
    }

    test('surfaces per-message VAL_ when the pool signal has empty valueDescriptions', () => {
        const db = new CanDatabase();
        const pool = poolSignal('Gear');
        db.addPoolSignal(pool);
        linkMessage(db, 0x100, 'Status', 'Gear');
        db.upsertValueDescription(
            0x100,
            'Gear',
            new Map([
                [0, 'Park'],
                [1, 'Reverse'],
            ]),
        );

        const merged = mergeEffectiveValueDescriptionsForPoolOnly(pool, db);
        assert.strictEqual(merged.get(0), 'Park');
        assert.strictEqual(merged.get(1), 'Reverse');
        assert.strictEqual(pool.valueDescriptions.size, 0);
    });

    test('same pool name on two frames: later db.messages VAL_ last-wins on duplicate keys', () => {
        const db = new CanDatabase();
        const pool = poolSignal('Shared');
        db.addPoolSignal(pool);
        linkMessage(db, 0x10, 'FirstFrame', 'Shared');
        linkMessage(db, 0x20, 'SecondFrame', 'Shared');
        db.upsertValueDescription(0x10, 'Shared', new Map([[0, 'from-first'], [1, 'only-first']]));
        db.upsertValueDescription(0x20, 'Shared', new Map([[0, 'from-second'], [2, 'only-second']]));

        const merged = mergeEffectiveValueDescriptionsForPoolOnly(pool, db);
        assert.strictEqual(merged.get(0), 'from-second', 'duplicate raw 0: last referencing message wins');
        assert.strictEqual(merged.get(1), 'only-first', 'keys unique to an earlier frame are kept');
        assert.strictEqual(merged.get(2), 'only-second');
    });

    test('named value table is included, then pool and later-frame VAL_ override the same keys', () => {
        const db = new CanDatabase();
        const pool = poolSignal('Gear');
        pool.valueTableName = 'GearTbl';
        pool.valueDescriptions.set(1, 'pool-override');
        db.addPoolSignal(pool);
        db.addValueTable(
            new ValueTable(
                'GearTbl',
                new Map([
                    [0, 'table-park'],
                    [1, 'table-reverse'],
                ]),
            ),
        );
        linkMessage(db, 0x100, 'Status', 'Gear');
        linkMessage(db, 0x200, 'Other', 'Unrelated');
        db.upsertValueDescription(0x100, 'Gear', new Map([[0, 'frame-park']]));

        const merged = mergeEffectiveValueDescriptionsForPoolOnly(pool, db);
        assert.strictEqual(merged.get(0), 'frame-park');
        assert.strictEqual(merged.get(1), 'pool-override');

        const perFrame = mergeEffectiveValueDescriptions(0x100, pool, db);
        assert.strictEqual(perFrame.get(0), 'frame-park');
        assert.strictEqual(perFrame.get(1), 'pool-override');
    });
});
