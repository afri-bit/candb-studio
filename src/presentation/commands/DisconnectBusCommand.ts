import * as vscode from 'vscode';
import { Commands } from '../../shared/constants';
import { Logger } from '../../shared/utils/Logger';
import { messageForUser } from '../../shared/utils/errorUtils';
import type { ConnectBusCommand } from './ConnectBusCommand';

/**
 * Command to disconnect from the currently connected CAN bus.
 */
export class DisconnectBusCommand {
    static readonly ID = Commands.DISCONNECT_BUS;

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
        } catch (err: unknown) {
            Logger.error('Failed to disconnect', err);
            vscode.window.showErrorMessage(`Failed to disconnect: ${messageForUser(err)}`);
        }
    }
}
