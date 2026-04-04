/**
 * SC-002: injected frames decode to expected physical values (virtual path = same as receive path).
 */
import * as assert from 'assert';
import { VirtualBusSimulationService } from '../../../../src/application/services/VirtualBusSimulationService';
import { MonitorService } from '../../../../src/application/services/MonitorService';
import { ByteOrder } from '../../../../src/core/enums/ByteOrder';
import { CanChannel } from '../../../../src/core/models/bus/CanChannel';
import { Message } from '../../../../src/core/models/database/Message';
import { Signal } from '../../../../src/core/models/database/Signal';
import { CanDatabase } from '../../../../src/core/models/database/CanDatabase';
import { AdapterType } from '../../../../src/core/enums/AdapterType';
import { SignalDecoder } from '../../../../src/infrastructure/codec/SignalDecoder';
import { VirtualCanAdapter } from '../../../../src/infrastructure/adapters/VirtualCanAdapter';
import { EventBus } from '../../../../src/shared/events/EventBus';
import { DEFAULT_BITRATE } from '../../../../src/shared/constants';

suite('VirtualBus SC-002 decode benchmark', () => {
    test('virtual inject yields decoded signal value matching encoder expectation', async () => {
        const database = new CanDatabase();
        database.signalPool.push(
            new Signal({
                name: 'RPM',
                startBit: 0,
                bitLength: 16,
                factor: 1,
                offset: 0,
            }),
        );
        const msg = new Message({ id: 0x100, name: 'EngineStatus', dlc: 8 });
        msg.addSignalRef({
            signalName: 'RPM',
            startBit: 0,
            bitLength: 16,
            byteOrder: ByteOrder.LittleEndian,
        });
        database.addMessage(msg);

        const adapter = new VirtualCanAdapter();
        await adapter.connect(
            new CanChannel({
                name: 't',
                adapterType: AdapterType.Virtual,
                bitrate: DEFAULT_BITRATE,
            }),
        );

        const eventBus = new EventBus();
        const decoder = new SignalDecoder();
        const monitor = new MonitorService(adapter, decoder, eventBus, database);
        monitor.start();

        let lastRpm: number | undefined;
        eventBus.on('bus:messageDecoded', (p) => {
            lastRpm = p.decoded.signalValues.get('RPM');
        });

        const svc = new VirtualBusSimulationService(() => database, eventBus);
        svc.setSimulationAdapter(adapter);
        svc.start();

        const payload = new Uint8Array(8);
        payload[0] = 0xe8;
        payload[1] = 0x03;
        const inj = svc.injectDbcAligned(0x100, payload);
        assert.strictEqual(inj.ok, true);
        assert.strictEqual(lastRpm, 1000);

        monitor.stop();
    });
});
