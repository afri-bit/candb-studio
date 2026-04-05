import * as vscode from 'vscode';
import type { VirtualBusSimulationService } from '../../application/services/VirtualBusSimulationService';
import { AdapterType } from '../../core/enums/AdapterType';
import { CanBusState } from '../../core/enums/CanBusState';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import { CanChannel } from '../../core/models/bus/CanChannel';
import { AdapterFactory } from '../../infrastructure/adapters/AdapterFactory';
import { SocketCanAdapter } from '../../infrastructure/adapters/SocketCanAdapter';
import { VirtualCanAdapter } from '../../infrastructure/adapters/VirtualCanAdapter';
import { Commands, DEFAULT_BITRATE } from '../../shared/constants';
import type { EventBus } from '../../shared/events/EventBus';
import { Logger } from '../../shared/utils/Logger';
import { messageForUser } from '../../shared/utils/errorUtils';

/**
 * Command to connect to a CAN bus interface.
 * Prompts the user to choose an adapter type and channel name.
 * Forwards adapter state changes to the shared EventBus so other layers
 * (ConnectionStatusBar, WebviewMessageHandler) react without tight coupling.
 */
export class ConnectBusCommand {
    static readonly ID = Commands.CONNECT_BUS;

    private adapter: ICanBusAdapter | null = null;
    private adapterConnectedCallbacks = new Set<(adapter: ICanBusAdapter) => void>();
    private adapterDisconnectedCallbacks = new Set<() => void>();
    private virtualBusSimulation: VirtualBusSimulationService | null = null;

    constructor(private readonly eventBus: EventBus) {}

    getAdapter(): ICanBusAdapter | null {
        return this.adapter;
    }

    /** Used to gate hardware/virtual switches while Signal Lab simulation is active. */
    setVirtualBusSimulationService(service: VirtualBusSimulationService | null): void {
        this.virtualBusSimulation = service;
    }

    /** Register a callback invoked with the new adapter after a successful connection. */
    onAdapterConnected(cb: (adapter: ICanBusAdapter) => void): () => void {
        this.adapterConnectedCallbacks.add(cb);
        return () => this.adapterConnectedCallbacks.delete(cb);
    }

    /** Register a callback invoked when the active adapter disconnects. */
    onAdapterDisconnected(cb: () => void): () => void {
        this.adapterDisconnectedCallbacks.add(cb);
        return () => this.adapterDisconnectedCallbacks.delete(cb);
    }

    private bridgeAdapterLifecycle(adapter: ICanBusAdapter): void {
        adapter.onStateChanged((state) => {
            this.eventBus.emit('bus:stateChanged', state);
            if (state === CanBusState.Disconnected) {
                this.adapter = null;
                for (const cb of this.adapterDisconnectedCallbacks) {
                    cb();
                }
            }
        });
    }

    /**
     * Disconnect without status-bar toasts (e.g. Signal Lab auto teardown after virtual stop).
     */
    async disconnectSilently(): Promise<void> {
        const a = this.adapter;
        if (a) {
            await a.disconnect();
        }
    }

    /**
     * Connect a prepared adapter instance (Signal Lab virtual bus). Replaces any existing connection.
     */
    async connectAdapter(
        adapter: ICanBusAdapter,
        channel: CanChannel,
        options?: { silentToast?: boolean },
    ): Promise<void> {
        try {
            if (this.virtualBusSimulation?.isRunning()) {
                const r = await vscode.window.showWarningMessage(
                    'Virtual bus simulation is running. Stop it before changing the adapter connection.',
                    { modal: true },
                    'Stop simulation',
                );
                if (r !== 'Stop simulation') {
                    throw new Error('CONNECT_CANCELLED');
                }
                this.virtualBusSimulation.stop();
            }

            if (this.adapter && this.adapter !== adapter) {
                await this.adapter.disconnect();
            }

            this.bridgeAdapterLifecycle(adapter);
            await adapter.connect(channel);
            this.adapter = adapter;
            Logger.info(`Connected adapter (${channel.name})`);
            if (!options?.silentToast) {
                vscode.window.showInformationMessage(`Connected to CAN bus: ${channel.name}`);
            }
            for (const cb of this.adapterConnectedCallbacks) {
                cb(adapter);
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.message === 'CONNECT_CANCELLED') {
                throw err;
            }
            Logger.error('connectAdapter failed', err);
            vscode.window.showErrorMessage(`Failed to connect: ${messageForUser(err)}`);
            this.adapter = null;
            throw err;
        }
    }

    async execute(): Promise<void> {
        const adapterTypes = AdapterFactory.getSupportedTypes();

        const selected = await vscode.window.showQuickPick(
            adapterTypes.map((t) => ({ label: t, adapterType: t as AdapterType })),
            { placeHolder: 'Select CAN adapter type' },
        );

        if (!selected) {
            return;
        }

        const isVirtual = selected.adapterType === AdapterType.Virtual;
        const channelName = await vscode.window.showInputBox({
            prompt: isVirtual
                ? 'Channel label (optional). Virtual mode is in-process software loopback only — no physical adapter or system CAN device.'
                : 'Enter SocketCAN interface name (e.g. can0 or vcan0).',
            value: isVirtual ? 'virtual-loopback' : 'can0',
        });

        if (!channelName) {
            return;
        }

        const existing = this.adapter;
        if (existing) {
            const targetVirtual = selected.adapterType === AdapterType.Virtual;
            const existingVirtual = existing instanceof VirtualCanAdapter;
            const existingHw = existing instanceof SocketCanAdapter;
            const targetHw = selected.adapterType === AdapterType.SocketCAN;
            if ((existingVirtual && targetHw) || (existingHw && targetVirtual)) {
                const r = await vscode.window.showWarningMessage(
                    existingVirtual
                        ? 'Software virtual CAN is connected. Disconnect and connect hardware instead?'
                        : 'Hardware CAN is connected. Disconnect and use virtual (software) instead?',
                    { modal: true },
                    'Disconnect and switch',
                );
                if (r !== 'Disconnect and switch') {
                    return;
                }
                await existing.disconnect();
            }
        }

        try {
            const newAdapter = AdapterFactory.create(selected.adapterType);
            const channel = new CanChannel({
                name: channelName,
                adapterType: selected.adapterType,
                bitrate: DEFAULT_BITRATE,
            });
            await this.connectAdapter(newAdapter, channel, { silentToast: false });
        } catch (err: unknown) {
            if (err instanceof Error && err.message === 'CONNECT_CANCELLED') {
                return;
            }
            throw err;
        }
    }
}
