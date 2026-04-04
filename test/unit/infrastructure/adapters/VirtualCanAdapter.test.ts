import * as assert from 'assert';
import { CanFrame } from '../../../../src/core/models/bus/CanFrame';
import { CanChannel } from '../../../../src/core/models/bus/CanChannel';
import { AdapterType } from '../../../../src/core/enums/AdapterType';
import { VirtualCanAdapter } from '../../../../src/infrastructure/adapters/VirtualCanAdapter';
import { DEFAULT_BITRATE } from '../../../../src/shared/constants';

suite('VirtualCanAdapter', () => {
    test('send() loopback notifies onFrameReceived', async () => {
        const a = new VirtualCanAdapter();
        const ch = new CanChannel({
            name: 't',
            adapterType: AdapterType.Virtual,
            bitrate: DEFAULT_BITRATE,
        });
        await a.connect(ch);
        const seen: CanFrame[] = [];
        a.onFrameReceived((f) => seen.push(f));
        const tx = new CanFrame({
            id: 0x123,
            data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
            dlc: 8,
            timestamp: 1,
        });
        await a.send(tx);
        assert.strictEqual(seen.length, 1);
        assert.strictEqual(seen[0].id, 0x123);
    });

    test('injectFrameForMonitor notifies without requiring send()', async () => {
        const a = new VirtualCanAdapter();
        const ch = new CanChannel({
            name: 't',
            adapterType: AdapterType.Virtual,
            bitrate: DEFAULT_BITRATE,
        });
        await a.connect(ch);
        const seen: CanFrame[] = [];
        a.onFrameReceived((f) => seen.push(f));
        const f = new CanFrame({
            id: 0xabc,
            data: new Uint8Array([0xaa]),
            dlc: 1,
            timestamp: 99,
        });
        a.injectFrameForMonitor(f);
        assert.strictEqual(seen.length, 1);
        assert.strictEqual(seen[0].id, 0xabc);
        assert.strictEqual(seen[0].data[0], 0xaa);
    });

    test('injectFrameForMonitor throws when disconnected', async () => {
        const a = new VirtualCanAdapter();
        assert.throws(
            () =>
                a.injectFrameForMonitor(
                    new CanFrame({
                        id: 1,
                        data: new Uint8Array([0]),
                        dlc: 1,
                        timestamp: 0,
                    }),
                ),
            /not connected/,
        );
    });
});
