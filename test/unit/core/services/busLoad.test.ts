import * as assert from 'assert';
import {
    CAN_BITRATES,
    calculateBusLoad,
    classicalFrameBits,
    type LoadMessage,
} from '../../../../src/core/services/busLoad';
import type { MessageSchedule } from '../../../../src/core/models/database/messageSchedule';
const schedule: MessageSchedule = {
    sendType: 'cyclic',
    cycleTimeMs: 10,
    sourceNetwork: 'A.dbc',
    forwardNetwork: '',
    forwardNode: '',
    forwardRateMode: 'source',
    forwardFrequencyHz: 0,
};
const message: LoadMessage = { id: 1, name: 'Status', dlc: 8, isFd: false, schedule };
suite('Bus load calculation', () => {
    test('includes Classical CAN overhead, intermission and bounded stuffing', () => {
        assert.deepStrictEqual(classicalFrameBits(8, false), { base: 111, worst: 135 });
        assert.deepStrictEqual(classicalFrameBits(8, true), { base: 131, worst: 160 });
        assert.deepStrictEqual(classicalFrameBits(0, false), { base: 47, worst: 55 });
        assert.throws(() => classicalFrameBits(9, false));
        assert.throws(() => classicalFrameBits(1.5, false));
        assert.deepStrictEqual(CAN_BITRATES, [125000, 250000, 500000, 800000, 1000000]);
    });
    test('100 Hz source and 20 Hz forwarding add to different networks', () => {
        const result = calculateBusLoad([
            {
                ...message,
                schedule: {
                    ...schedule,
                    forwardNetwork: 'B.dbc',
                    forwardNode: 'Gateway',
                    forwardRateMode: 'derated',
                    forwardFrequencyHz: 20,
                },
            },
        ]);
        assert.strictEqual(result.networks[0].baseBitsPerSecond, 11100);
        assert.strictEqual(result.networks[1].baseBitsPerSecond, 2220);
        assert.strictEqual(result.networks[1].worstBitsPerSecond, 2700);
        assert.deepStrictEqual(result.excluded, []);
    });
    test('source mode forwards the same frequency; multiplex branches do not multiply frames', () => {
        const result = calculateBusLoad([
            {
                ...message,
                schedule: { ...schedule, forwardNetwork: 'B.dbc', forwardNode: 'Gateway' },
            },
        ]);
        assert.strictEqual(result.networks[1].framesPerSecond, 100);
    });
    test('trigger estimates are keyed by network, even with identical CAN IDs', () => {
        const result = calculateBusLoad(
            [
                { ...message, key: 'A:1', schedule: { ...schedule, sendType: 'trigger' } },
                {
                    ...message,
                    key: 'B:1',
                    schedule: { ...schedule, sourceNetwork: 'B.dbc', sendType: 'trigger' },
                },
            ],
            { 'A:1': 5, 'B:1': 10 },
        );
        assert.deepStrictEqual(
            result.networks.map((n) => n.framesPerSecond),
            [5, 10],
        );
    });
    test('unknown trigger traffic, zero cycles and FD are excluded, not presented as zero load', () => {
        const result = calculateBusLoad([
            { ...message, schedule: { ...schedule, sendType: 'trigger' } },
            { ...message, schedule: { ...schedule, cycleTimeMs: 0 } },
            { ...message, isFd: true },
        ]);
        assert.strictEqual(result.excluded.length, 3);
        assert.strictEqual(result.networks.length, 0);
    });
    test('a forwarding rate above source excludes only the invalid route', () => {
        const result = calculateBusLoad([
            {
                ...message,
                schedule: {
                    ...schedule,
                    forwardNetwork: 'B.dbc',
                    forwardNode: 'GW',
                    forwardRateMode: 'derated',
                    forwardFrequencyHz: 200,
                },
            },
        ]);
        assert.strictEqual(result.networks.length, 1);
        assert.strictEqual(result.excluded.length, 1);
    });
    test('over-capacity loads are not clamped to 100 percent', () => {
        const result = calculateBusLoad([
            { ...message, schedule: { ...schedule, cycleTimeMs: 0.1 } },
        ]);
        assert.ok(result.networks[0].baseBitsPerSecond > 1000000);
    });
});
