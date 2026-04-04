import * as assert from 'assert';
import { ConnectBusCommand } from '../../../src/presentation/commands/ConnectBusCommand';
import { EventBus } from '../../../src/shared/events/EventBus';

suite('ConnectBusCommand virtual simulation gate', () => {
    test('setVirtualBusSimulationService registers without throw', () => {
        const cmd = new ConnectBusCommand(new EventBus());
        assert.doesNotThrow(() => cmd.setVirtualBusSimulationService(null));
    });
});
