import * as assert from 'assert';
import { MonitorService } from '../../../../src/application/services/MonitorService';
import { VirtualBusSimulationService } from '../../../../src/application/services/VirtualBusSimulationService';
import { CanChannel } from '../../../../src/core/models/bus/CanChannel';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { Message } from '../../../../src/core/models/database/Message';
import { AdapterType } from '../../../../src/core/enums/AdapterType';
import { VirtualCanAdapter } from '../../../../src/infrastructure/adapters/VirtualCanAdapter';
import { SignalDecoder } from '../../../../src/infrastructure/codec/SignalDecoder';
import { DEFAULT_BITRATE } from '../../../../src/shared/constants';
import { EventBus } from '../../../../src/shared/events/EventBus';

suite('VirtualBusSimulationService', () => {
    test('start fails without adapter', () => {
        const svc = new VirtualBusSimulationService(() => null, new EventBus());
        const r = svc.start();
        assert.strictEqual(r.ok, false);
    });

    test('inject rejected when no database', async () => {
        const adapter = new VirtualCanAdapter();
        const ch = new CanChannel({
            name: 't',
            adapterType: AdapterType.Virtual,
            bitrate: DEFAULT_BITRATE,
        });
        await adapter.connect(ch);
        const svc = new VirtualBusSimulationService(() => null, new EventBus());
        svc.setSimulationAdapter(adapter);
        svc.start();
        const inj = svc.injectDbcAligned(0x100, new Uint8Array([0]));
        assert.strictEqual(inj.ok, false);
    });

    test('inject delivers frame to adapter listeners', async () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x301, name: 'N', dlc: 1 }));
        const adapter = new VirtualCanAdapter();
        const ch = new CanChannel({
            name: 't',
            adapterType: AdapterType.Virtual,
            bitrate: DEFAULT_BITRATE,
        });
        await adapter.connect(ch);
        const frames: number[] = [];
        adapter.onFrameReceived((f) => frames.push(f.id));
        const svc = new VirtualBusSimulationService(() => db, new EventBus());
        svc.setSimulationAdapter(adapter);
        svc.start();
        const inj = svc.injectDbcAligned(0x301, new Uint8Array([0x42]));
        assert.strictEqual(inj.ok, true);
        assert.strictEqual(frames.length, 1);
        assert.strictEqual(frames[0], 0x301);
    });

    test('stop clears periodic timers', async () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x302, name: 'P', dlc: 1 }));
        const adapter = new VirtualCanAdapter();
        await adapter.connect(
            new CanChannel({
                name: 't',
                adapterType: AdapterType.Virtual,
                bitrate: DEFAULT_BITRATE,
            }),
        );
        const svc = new VirtualBusSimulationService(() => db, new EventBus());
        svc.setSimulationAdapter(adapter);
        svc.start();
        const r = svc.startPeriodic(0x302, new Uint8Array([0]), 20);
        assert.strictEqual(r.ok, true);
        assert.ok(Object.keys(svc.getPeriodicIntervals()).length > 0);
        svc.stop();
        assert.strictEqual(Object.keys(svc.getPeriodicIntervals()).length, 0);
    });

    test('updatePeriodicPayload is reflected on subsequent periodic injects', async () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x303, name: 'Q', dlc: 1 }));
        const adapter = new VirtualCanAdapter();
        await adapter.connect(
            new CanChannel({
                name: 't',
                adapterType: AdapterType.Virtual,
                bitrate: DEFAULT_BITRATE,
            }),
        );
        const payloads: number[][] = [];
        adapter.onFrameReceived((f) => payloads.push([...f.data]));
        const svc = new VirtualBusSimulationService(() => db, new EventBus());
        svc.setSimulationAdapter(adapter);
        svc.start();
        try {
            const r = svc.startPeriodic(0x303, new Uint8Array([1]), 15);
            assert.strictEqual(r.ok, true);
            await new Promise<void>((resolve) => setTimeout(resolve, 45));
            assert.ok(payloads.some((p) => p[0] === 1), 'initial periodic payload should be 0x01');
            const updated = svc.updatePeriodicPayload(0x303, [0xab]);
            assert.strictEqual(updated, true);
            await new Promise<void>((resolve) => setTimeout(resolve, 45));
            assert.ok(
                payloads.some((p) => p[0] === 0xab),
                `after updatePeriodicPayload, injects should include 0xab; got ${JSON.stringify(payloads)}`,
            );
        } finally {
            svc.stop();
        }
    });

    test('inject correlates as Tx for MonitorService (not orphan Rx)', async () => {
        const db = new CanDatabase();
        db.addMessage(new Message({ id: 0x304, name: 'TxDir', dlc: 1 }));
        const adapter = new VirtualCanAdapter();
        await adapter.connect(
            new CanChannel({
                name: 't',
                adapterType: AdapterType.Virtual,
                bitrate: DEFAULT_BITRATE,
            }),
        );
        const eventBus = new EventBus();
        const monitor = new MonitorService(adapter, new SignalDecoder(), eventBus, db);
        monitor.start();
        const directions: string[] = [];
        eventBus.on('bus:messageDecoded', (p) => directions.push(p.direction));
        const svc = new VirtualBusSimulationService(() => db, eventBus);
        svc.setSimulationAdapter(adapter);
        svc.start();
        const inj = svc.injectDbcAligned(0x304, new Uint8Array([0x7f]));
        assert.strictEqual(inj.ok, true);
        assert.strictEqual(directions.length, 1);
        assert.strictEqual(directions[0], 'tx');
        monitor.stop();
    });
});
