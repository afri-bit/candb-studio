import * as vscode from 'vscode';
import type { ConnectBusCommand } from './ConnectBusCommand';
import { Logger } from '../../shared/utils/Logger';

/**
 * Command to disconnect from the currently connected CAN bus.
 */
export class DisconnectBusCommand {
  static readonly ID = 'vscode-canbus.disconnectBus';

  constructor(private readonly connectCommand: ConnectBusCommand) {}

  async execute(): Promise<void> {
    const adapter = this.connectCommand.getAdapter();
    if (!adapter) {
      vscode.window.showInformationMessage('Not connected to any CAN bus');
      return;
    }

    try {
      await adapter.disconnect();
      Logger.info('Disconnected from CAN bus');
      vscode.window.showInformationMessage('Disconnected from CAN bus');
    } catch (error) {
      Logger.error('Failed to disconnect', error);
      vscode.window.showErrorMessage(
        `Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
