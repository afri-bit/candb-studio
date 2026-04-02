import { AdapterType } from '../../core/enums/AdapterType';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import { SocketCanAdapter } from './SocketCanAdapter';
import { VirtualCanAdapter } from './VirtualCanAdapter';

/**
 * Factory for creating CAN bus adapter instances based on the configured type.
 * Follows the same Open/Closed pattern as ParserFactory — new adapters are
 * registered here without touching existing code.
 */
export class AdapterFactory {
    private static readonly registry = new Map<AdapterType, () => ICanBusAdapter>([
        [AdapterType.SocketCAN, () => new SocketCanAdapter()],
        [AdapterType.Virtual, () => new VirtualCanAdapter()],
    ]);

    /** Create a new adapter instance for the given type. */
    static create(type: AdapterType): ICanBusAdapter {
        const factory = AdapterFactory.registry.get(type);
        if (!factory) {
            throw new Error(`No adapter registered for type: ${type}`);
        }
        return factory();
    }

    /** Register a custom adapter factory for a given type. */
    static register(type: AdapterType, factory: () => ICanBusAdapter): void {
        AdapterFactory.registry.set(type, factory);
    }

    /** Return all currently registered adapter types. */
    static getSupportedTypes(): AdapterType[] {
        return Array.from(AdapterFactory.registry.keys());
    }
}
