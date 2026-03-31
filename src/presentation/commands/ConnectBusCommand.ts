import * as vscode from 'vscode';
import type { ICanBusAdapter } from '../../core/interfaces/bus/ICanBusAdapter';
import { CanChannel } from '../../core/models/bus/CanChannel';
import { AdapterType } from '../../core/enums/AdapterType';
import { CanBusState } from '../../core/enums/CanBusState';
import { AdapterFactory } from '../../infrastructure/adapters/AdapterFactory';
import type { EventBus } from '../../shared/events/EventBus';
import { DEFAULT_BITRATE } from '../../shared/constants';
import { Logger } from '../../shared/utils/Logger';

/**
 * Command to connect to a CAN bus interface.
 * Prompts the user to choose an adapter type and channel name.
 * Forwards adapter state changes to the shared EventBus so other layers
 * (ConnectionStatusBar, WebviewMessageHandler) react without tight coupling.
 */
export class ConnectBusCommand {
  static readonly ID = 'vscode-canbus.connectBus';

  private adapter: ICanBusAdapter | null = null;
  private adapterConnectedCallbacks = new Set<(adapter: ICanBusAdapter) => void>();
  private adapterDisconnectedCallbacks = new Set<() => void>();

  constructor(private readonly eventBus: EventBus) {}

  getAdapter(): ICanBusAdapter | null {
    return this.adapter;
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

  async execute(): Promise<void> {
    const adapterTypes = AdapterFactory.getSupportedTypes();

    const selected = await vscode.window.showQuickPick(
      adapterTypes.map((t) => ({ label: t, adapterType: t as AdapterType })),
      { placeHolder: 'Select CAN adapter type' },
    );

    if (!selected) {
      return;
    }

    const channelName = await vscode.window.showInputBox({
      prompt: 'Enter channel name (e.g., can0, vcan0)',
      value: selected.adapterType === AdapterType.Virtual ? 'vcan0' : 'can0',
    });

    if (!channelName) {
      return;
    }

    try {
      const newAdapter = AdapterFactory.create(selected.adapterType);

      // Bridge adapter state changes → EventBus so the status bar and webview update.
      newAdapter.onStateChanged((state) => {
        this.eventBus.emit('bus:stateChanged', state);
        if (state === CanBusState.Disconnected) {
          this.adapter = null;
          for (const cb of this.adapterDisconnectedCallbacks) { cb(); }
        }
      });

      const channel = new CanChannel({
        name: channelName,
        adapterType: selected.adapterType,
        bitrate: DEFAULT_BITRATE,
      });
      await newAdapter.connect(channel);

      this.adapter = newAdapter;
      Logger.info(`Connected to ${channelName} via ${selected.adapterType}`);
      vscode.window.showInformationMessage(`Connected to CAN bus: ${channelName}`);

      for (const cb of this.adapterConnectedCallbacks) { cb(newAdapter); }
    } catch (error) {
      Logger.error('Failed to connect to CAN bus', error);
      vscode.window.showErrorMessage(
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.adapter = null;
    }
  }
}
