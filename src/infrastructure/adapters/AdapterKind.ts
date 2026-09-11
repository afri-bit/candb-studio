import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import { VirtualCanAdapter } from './VirtualCanAdapter';

/**
 * True for any real hardware/bridge-backed adapter — i.e. anything other than
 * the in-process virtual loopback. Used to gate virtual↔hardware switches and
 * connection-state reporting without enumerating every concrete adapter class.
 */
export function isHardwareAdapter(adapter: ICanBusAdapter): boolean {
    return !(adapter instanceof VirtualCanAdapter);
}
