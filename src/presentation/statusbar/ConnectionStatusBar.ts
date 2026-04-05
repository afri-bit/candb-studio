import * as vscode from 'vscode';
import { CanBusState } from '../../core/enums/CanBusState';
import { Commands } from '../../shared/constants';
import type { EventBus } from '../../shared/events/EventBus';

/**
 * Status bar item showing the current CAN bus connection state.
 * Clicking it triggers connect or disconnect depending on current state.
 */
export class ConnectionStatusBar {
    private item: vscode.StatusBarItem;
    private unsubscribe?: () => void;

    constructor(eventBus: EventBus) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.update(CanBusState.Disconnected);
        this.item.show();

        this.unsubscribe = eventBus.on('bus:stateChanged', (state) => {
            this.update(state);
        });
    }

    private update(state: CanBusState): void {
        switch (state) {
            case CanBusState.Connected:
                this.item.text = '$(plug) CAN: Connected';
                this.item.tooltip = 'Click to disconnect from CAN bus';
                this.item.command = Commands.DISCONNECT_BUS;
                this.item.backgroundColor = undefined;
                break;

            case CanBusState.Connecting:
                this.item.text = '$(sync~spin) CAN: Connecting…';
                this.item.tooltip = 'Connecting… Click to cancel (disconnect).';
                this.item.command = Commands.DISCONNECT_BUS;
                this.item.backgroundColor = undefined;
                break;

            case CanBusState.Error:
                this.item.text = '$(error) CAN: Error';
                this.item.tooltip = 'CAN bus error. Click to reconnect.';
                this.item.command = Commands.CONNECT_BUS;
                this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;

            default:
                this.item.text = '$(debug-disconnect) CAN: Disconnected';
                this.item.tooltip = 'Click to connect to CAN bus';
                this.item.command = Commands.CONNECT_BUS;
                this.item.backgroundColor = undefined;
                break;
        }
    }

    dispose(): void {
        this.unsubscribe?.();
        this.item.dispose();
    }
}
