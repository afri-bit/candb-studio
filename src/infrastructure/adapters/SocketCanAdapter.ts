import { CanBusState } from '../../core/enums/CanBusState';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import type { CanChannel } from '../../core/models/bus/CanChannel';
import type { CanFrame } from '../../core/models/bus/CanFrame';
import type { Disposable } from '../../core/types';
import { ConnectionError } from '../../shared/errors/ConnectionError';
import { Logger } from '../../shared/utils/Logger';

/**
 * CAN bus adapter for Linux SocketCAN interfaces.
 * Requires the host to have SocketCAN support and the `can-utils` package.
 *
 * TODO: Implement actual SocketCAN communication via native bindings or child process.
 */
export class SocketCanAdapter implements ICanBusAdapter {
    private _state: CanBusState = CanBusState.Disconnected;
    private frameCallbacks = new Set<(frame: CanFrame) => void>();
    private stateCallbacks = new Set<(state: CanBusState) => void>();
    private errorCallbacks = new Set<(error: Error) => void>();

    get state(): CanBusState {
        return this._state;
    }

    async connect(channel: CanChannel): Promise<void> {
        Logger.info(`SocketCAN: connecting to ${channel.name} at ${channel.bitrate} bps`);
        this.setState(CanBusState.Connecting);
        try {
            // TODO: Open SocketCAN socket via native bindings
            // e.g., socket(PF_CAN, SOCK_RAW, CAN_RAW) + bind to channel.name
            throw new ConnectionError(
                `SocketCAN adapter not yet implemented. Cannot connect to ${channel.name}.`,
                'socketcan',
            );
        } catch (err) {
            this.setState(CanBusState.Disconnected);
            throw err;
        }
    }

    async disconnect(): Promise<void> {
        Logger.info('SocketCAN: disconnecting');
        // TODO: Close the SocketCAN socket
        this.setState(CanBusState.Disconnected);
    }

    async send(frame: CanFrame): Promise<void> {
        if (this._state !== CanBusState.Connected) {
            throw new ConnectionError('Cannot send: not connected', 'socketcan');
        }
        // TODO: Write frame to SocketCAN socket
        Logger.info(`SocketCAN: sending frame ${frame.idHex}`);
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

    /** Notify all frame listeners — called internally when a frame arrives from hardware. */
    protected notifyFrame(frame: CanFrame): void {
        for (const cb of this.frameCallbacks) {
            cb(frame);
        }
    }

    private setState(newState: CanBusState): void {
        this._state = newState;
        for (const cb of this.stateCallbacks) {
            cb(newState);
        }
    }
}
