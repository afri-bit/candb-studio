import { CanBusState } from '../../core/enums/CanBusState';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import type { CanChannel } from '../../core/models/bus/CanChannel';
import { CanFrame } from '../../core/models/bus/CanFrame';
import type { Disposable } from '../../core/types';
import { ConnectionError } from '../../shared/errors/ConnectionError';
import { Logger } from '../../shared/utils/Logger';

/**
 * Software loopback CAN bus adapter for testing and development.
 * Frames sent via send() are immediately echoed back to onFrameReceived listeners.
 */
export class VirtualCanAdapter implements ICanBusAdapter {
    private _state: CanBusState = CanBusState.Disconnected;
    private frameCallbacks = new Set<(frame: CanFrame) => void>();
    private stateCallbacks = new Set<(state: CanBusState) => void>();
    private errorCallbacks = new Set<(error: Error) => void>();

    get state(): CanBusState {
        return this._state;
    }

    async connect(_channel: CanChannel): Promise<void> {
        Logger.info('VirtualCAN: connecting (software loopback)');
        this.setState(CanBusState.Connecting);
        this.setState(CanBusState.Connected);
        Logger.info('VirtualCAN: connected');
    }

    async disconnect(): Promise<void> {
        Logger.info('VirtualCAN: disconnecting');
        this.setState(CanBusState.Disconnected);
    }

    async send(frame: CanFrame): Promise<void> {
        if (this._state !== CanBusState.Connected) {
            throw new ConnectionError('Cannot send: not connected', 'virtual');
        }
        Logger.info(`VirtualCAN: loopback frame ${frame.idHex}`);
        // Echo a copy with a fresh timestamp so each loopback looks like a distinct receive.
        const loopback = new CanFrame({
            id: frame.id,
            data: new Uint8Array(frame.data),
            dlc: frame.dlc,
            isExtended: frame.isExtended,
            timestamp: Date.now(),
            isFd: frame.isFd,
            isBrs: frame.isBrs,
            isEsi: frame.isEsi,
        });
        for (const cb of this.frameCallbacks) {
            cb(loopback);
        }
    }

    /**
     * Push a frame into the same receive path as incoming bus traffic without going through
     * {@link send} (no transmit echo / tx classification). Used for virtual simulation injection.
     */
    injectFrameForMonitor(frame: CanFrame): void {
        if (this._state !== CanBusState.Connected) {
            throw new ConnectionError('Cannot inject: not connected', 'virtual');
        }
        const copy = new CanFrame({
            id: frame.id,
            data: new Uint8Array(frame.data),
            dlc: frame.dlc,
            isExtended: frame.isExtended,
            timestamp: Date.now(),
            isFd: frame.isFd,
            isBrs: frame.isBrs,
            isEsi: frame.isEsi,
        });
        for (const cb of this.frameCallbacks) {
            cb(copy);
        }
    }

    onFrameReceived(callback: (frame: CanFrame) => void): Disposable {
        this.frameCallbacks.add(callback);
        return { dispose: () => this.frameCallbacks.delete(callback) };
    }

    onStateChanged(callback: (state: CanBusState) => void): Disposable {
        this.stateCallbacks.add(callback);
        return { dispose: () => this.stateCallbacks.delete(callback) };
    }

    onError(callback: (error: Error) => void): Disposable {
        this.errorCallbacks.add(callback);
        return { dispose: () => this.errorCallbacks.delete(callback) };
    }

    private setState(newState: CanBusState): void {
        this._state = newState;
        for (const cb of this.stateCallbacks) {
            cb(newState);
        }
    }
}
