import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { AdapterType } from '../../core/enums/AdapterType';
import { CanBusState } from '../../core/enums/CanBusState';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import type { CanChannel } from '../../core/models/bus/CanChannel';
import { CanFrame } from '../../core/models/bus/CanFrame';
import type { Disposable } from '../../core/types';
import { ConnectionError } from '../../shared/errors/ConnectionError';
import { Logger } from '../../shared/utils/Logger';

/** Minimum bridge protocol version this adapter understands. */
const SUPPORTED_PROTOCOL_MAJOR = 1;

/** How long to wait for the bridge `ready` handshake and for command replies. */
const HANDSHAKE_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
}

interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}

interface PendingRequest {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export interface BridgeCanAdapterOptions {
    /**
     * python-can interface family this adapter connects through (e.g. "pcan").
     * Maps 1:1 to a python-can `interface=` value on the bridge side.
     */
    interfaceName: string;
    /** Executable used to launch the bridge. Defaults to `CANDB_BRIDGE_PYTHON` env or "python". */
    pythonPath?: string;
    /** Python module the bridge is exposed as. Defaults to "candb_bridge". */
    pythonModule?: string;
}

/**
 * CAN bus adapter backed by the external `candb-bridge` Python process.
 *
 * The bridge wraps python-can and exposes vendor backends (PCAN/PEAK, Kvaser,
 * Vector, SocketCAN) over line-delimited JSON-RPC 2.0 on stdio. This keeps all
 * native vendor-SDK complexity out of the extension host — see
 * `specs/007-multi-can-adapters/architecture.md`.
 *
 * Each adapter instance owns its own bridge process for the lifetime of a
 * connection and terminates it on {@link disconnect}.
 */
export class BridgeCanAdapter implements ICanBusAdapter {
    private _state: CanBusState = CanBusState.Disconnected;
    private readonly frameCallbacks = new Set<(frame: CanFrame) => void>();
    private readonly stateCallbacks = new Set<(state: CanBusState) => void>();
    private readonly errorCallbacks = new Set<(error: Error) => void>();

    private readonly interfaceName: string;
    private readonly pythonPath: string;
    private readonly pythonModule: string;

    private proc: ChildProcessWithoutNullStreams | null = null;
    private stdoutBuffer = '';
    private nextRequestId = 1;
    private readonly pending = new Map<number, PendingRequest>();
    private handshakeDone = false;

    constructor(options: BridgeCanAdapterOptions) {
        this.interfaceName = options.interfaceName;
        this.pythonPath = options.pythonPath ?? process.env.CANDB_BRIDGE_PYTHON ?? 'python';
        this.pythonModule = options.pythonModule ?? 'candb_bridge';
    }

    get state(): CanBusState {
        return this._state;
    }

    /** VS Code-facing adapter type this bridge instance represents. */
    get adapterType(): AdapterType {
        switch (this.interfaceName) {
            case 'pcan':
                return AdapterType.PCAN;
            case 'vector':
                return AdapterType.Vector;
            case 'socketcan':
                return AdapterType.SocketCAN;
            default:
                return AdapterType.PCAN;
        }
    }

    async connect(channel: CanChannel): Promise<void> {
        this.setState(CanBusState.Connecting);
        try {
            await this.ensureBridge();
            const fdInfo = channel.dataBitrate ? ` / data ${channel.dataBitrate} bps (FD)` : '';
            Logger.info(
                `Bridge(${this.interfaceName}): connecting to ${channel.name} at ${channel.bitrate} bps${fdInfo}`,
            );
            await this.request('connect', {
                interface: this.interfaceName,
                channel: channel.name,
                bitrate: channel.bitrate,
                fd_bitrate: channel.dataBitrate ?? null,
            });
            // `connect` resolving ok means the bridge opened the bus; state
            // notifications drive the final Connected transition, but assert it
            // here so callers relying on the return see a connected adapter.
            if (this._state !== CanBusState.Connected) {
                this.setState(CanBusState.Connected);
            }
        } catch (err) {
            await this.teardown();
            this.setState(CanBusState.Disconnected);
            throw this.toConnectionError(err, channel.name);
        }
    }

    async disconnect(): Promise<void> {
        Logger.info(`Bridge(${this.interfaceName}): disconnecting`);
        if (this.proc && this.handshakeDone) {
            try {
                await this.request('disconnect', {});
            } catch (err) {
                Logger.error(`Bridge(${this.interfaceName}): disconnect request failed`, err);
            }
        }
        await this.teardown();
        this.setState(CanBusState.Disconnected);
    }

    async send(frame: CanFrame): Promise<void> {
        if (this._state !== CanBusState.Connected) {
            throw new ConnectionError('Cannot send: not connected', this.interfaceName);
        }
        await this.request('send', {
            id: frame.id,
            data: Array.from(frame.data),
            extended: frame.isExtended,
            fd: frame.isFd,
            brs: frame.isBrs,
            dlc: frame.dlc,
        });
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

    private async ensureBridge(): Promise<void> {
        if (this.proc && this.handshakeDone) {
            return;
        }
        await this.spawnBridge();
        await this.waitForHandshake();
    }

    private spawnBridge(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let child: ChildProcessWithoutNullStreams;
            try {
                child = spawn(this.pythonPath, ['-m', this.pythonModule], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
            } catch (err) {
                reject(this.spawnFailure(err));
                return;
            }

            child.on('error', (err) => {
                // ENOENT etc. — python not found before the process ever started.
                if (!this.handshakeDone) {
                    reject(this.spawnFailure(err));
                }
                this.failPending(this.spawnFailure(err));
                this.notifyError(this.spawnFailure(err));
            });

            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (chunk: string) =>
                Logger.warn(`Bridge(${this.interfaceName}) stderr: ${chunk.trimEnd()}`),
            );

            child.on('close', (code) => {
                Logger.info(`Bridge(${this.interfaceName}): process exited (code ${code})`);
                const wasConnected = this._state === CanBusState.Connected;
                this.proc = null;
                this.handshakeDone = false;
                this.failPending(
                    new ConnectionError('Bridge process exited', this.interfaceName),
                );
                if (wasConnected || this._state === CanBusState.Connecting) {
                    this.setState(CanBusState.Disconnected);
                }
            });

            this.proc = child;
            resolve();
        });
    }

    private waitForHandshake(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(-1);
                reject(
                    new ConnectionError(
                        'Timed out waiting for candb-bridge handshake',
                        this.interfaceName,
                    ),
                );
            }, HANDSHAKE_TIMEOUT_MS);

            // The handshake resolves from onNotification when `ready` arrives.
            this.pending.set(-1, {
                resolve: () => {
                    clearTimeout(timer);
                    resolve();
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
                timer,
            });
        });
    }

    private onStdout(chunk: string): void {
        this.stdoutBuffer += chunk;
        let newlineIndex = this.stdoutBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
            const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
            this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
            if (line.length > 0) {
                this.handleLine(line);
            }
            newlineIndex = this.stdoutBuffer.indexOf('\n');
        }
    }

    private handleLine(line: string): void {
        let msg: JsonRpcResponse | JsonRpcNotification;
        try {
            msg = JSON.parse(line);
        } catch {
            Logger.warn(`Bridge(${this.interfaceName}): non-JSON line ignored: ${line}`);
            return;
        }
        if ('id' in msg && typeof msg.id === 'number') {
            this.handleResponse(msg);
        } else if ('method' in msg) {
            this.handleNotification(msg);
        }
    }

    private handleResponse(msg: JsonRpcResponse): void {
        const pending = this.pending.get(msg.id);
        if (!pending) {
            return;
        }
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
            pending.reject(new ConnectionError(msg.error.message, this.interfaceName));
        } else {
            pending.resolve(msg.result);
        }
    }

    private handleNotification(msg: JsonRpcNotification): void {
        const params = msg.params ?? {};
        switch (msg.method) {
            case 'ready':
                this.onReady(params);
                break;
            case 'frame':
                this.onFrameNotification(params);
                break;
            case 'state':
                this.onStateNotification(params);
                break;
            case 'error':
                this.notifyError(
                    new ConnectionError(String(params.message ?? 'Bridge error'), this.interfaceName),
                );
                break;
            default:
                Logger.warn(`Bridge(${this.interfaceName}): unknown notification ${msg.method}`);
        }
    }

    private onReady(params: Record<string, unknown>): void {
        const version = String(params.version ?? '0.0.0');
        const major = parseInt(version.split('.')[0] ?? '0', 10);
        const handshake = this.pending.get(-1);
        if (Number.isNaN(major) || major !== SUPPORTED_PROTOCOL_MAJOR) {
            handshake?.reject(
                new ConnectionError(
                    `Incompatible candb-bridge version ${version} (need ${SUPPORTED_PROTOCOL_MAJOR}.x). Update with: pip install -U candb-bridge`,
                    this.interfaceName,
                ),
            );
            this.pending.delete(-1);
            return;
        }
        const capabilities = Array.isArray(params.capabilities)
            ? (params.capabilities as string[])
            : [];
        if (capabilities.length > 0 && !capabilities.includes(this.interfaceName)) {
            handshake?.reject(
                new ConnectionError(
                    `candb-bridge reports no "${this.interfaceName}" backend. Available: ${capabilities.join(', ') || 'none'}.`,
                    this.interfaceName,
                ),
            );
            this.pending.delete(-1);
            return;
        }
        this.handshakeDone = true;
        this.sendRaw({ jsonrpc: '2.0', method: 'ack', params: { version } });
        this.pending.delete(-1);
        handshake?.resolve(undefined);
    }

    private onFrameNotification(params: Record<string, unknown>): void {
        const dataArr = Array.isArray(params.data) ? (params.data as number[]) : [];
        const tsSeconds = typeof params.timestamp === 'number' ? params.timestamp : undefined;
        const frame = new CanFrame({
            id: Number(params.id ?? 0),
            data: Uint8Array.from(dataArr),
            dlc: typeof params.dlc === 'number' ? params.dlc : dataArr.length,
            isExtended: Boolean(params.extended),
            timestamp: tsSeconds !== undefined ? Math.round(tsSeconds * 1000) : Date.now(),
            isFd: Boolean(params.fd),
            isBrs: Boolean(params.brs),
            isEsi: Boolean(params.esi),
        });
        for (const cb of this.frameCallbacks) {
            cb(frame);
        }
    }

    private onStateNotification(params: Record<string, unknown>): void {
        const status = String(params.status ?? '');
        switch (status) {
            case 'connecting':
                this.setState(CanBusState.Connecting);
                break;
            case 'connected':
                this.setState(CanBusState.Connected);
                break;
            case 'disconnected':
                this.setState(CanBusState.Disconnected);
                break;
            case 'error':
                this.setState(CanBusState.Error);
                if (params.message) {
                    this.notifyError(
                        new ConnectionError(String(params.message), this.interfaceName),
                    );
                }
                break;
            default:
                Logger.warn(`Bridge(${this.interfaceName}): unknown state "${status}"`);
        }
    }

    private request(method: string, params: Record<string, unknown>): Promise<unknown> {
        if (!this.proc || !this.handshakeDone) {
            return Promise.reject(
                new ConnectionError('Bridge is not ready', this.interfaceName),
            );
        }
        const id = this.nextRequestId++;
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(
                    new ConnectionError(`Bridge "${method}" timed out`, this.interfaceName),
                );
            }, REQUEST_TIMEOUT_MS);
            this.pending.set(id, { resolve, reject, timer });
            this.sendRaw({ jsonrpc: '2.0', id, method, params });
        });
    }

    private sendRaw(message: object): void {
        if (!this.proc) {
            return;
        }
        this.proc.stdin.write(`${JSON.stringify(message)}\n`);
    }

    private async teardown(): Promise<void> {
        const child = this.proc;
        this.proc = null;
        this.handshakeDone = false;
        this.failPending(new ConnectionError('Bridge connection closed', this.interfaceName));
        if (child && child.exitCode === null) {
            child.kill();
        }
    }

    private failPending(error: Error): void {
        for (const [id, req] of this.pending) {
            clearTimeout(req.timer);
            req.reject(error);
            this.pending.delete(id);
        }
    }

    private spawnFailure(err: unknown): ConnectionError {
        const detail = err instanceof Error ? err.message : String(err);
        return new ConnectionError(
            `Could not start candb-bridge with "${this.pythonPath} -m ${this.pythonModule}". Ensure Python is installed and run: pip install candb-bridge. (${detail})`,
            this.interfaceName,
        );
    }

    private toConnectionError(err: unknown, channelName: string): ConnectionError {
        if (err instanceof ConnectionError) {
            return err;
        }
        const detail = err instanceof Error ? err.message : String(err);
        return new ConnectionError(
            `Failed to connect ${this.interfaceName} channel "${channelName}": ${detail}`,
            this.interfaceName,
        );
    }

    private notifyError(error: Error): void {
        for (const cb of this.errorCallbacks) {
            cb(error);
        }
    }

    private setState(newState: CanBusState): void {
        if (this._state === newState) {
            return;
        }
        this._state = newState;
        for (const cb of this.stateCallbacks) {
            cb(newState);
        }
    }
}
