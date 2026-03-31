import * as vscode from 'vscode';
import { BaseTreeItem } from './BaseTreeItem';
import type { CanDatabase } from '../../../../core/models/database/CanDatabase';
import type { Message } from '../../../../core/models/database/Message';

/**
 * Tree item representing a CAN message.
 * Collapses/expands to show the message's constituent signals.
 */
export class MessageTreeItem extends BaseTreeItem {
  constructor(public readonly message: Message, public readonly database: CanDatabase) {
    const n = message.getResolvedSignals(database.signalPool, database).length;
    super(
      `${message.name} (${message.idHex})`,
      n > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      'canMessage',
    );

    this.tooltip = [
      `ID: ${message.idHex}`,
      `DLC: ${message.dlc}`,
      `Transmitter: ${message.transmittingNode || 'N/A'}`,
      `Signals: ${n}`,
    ].join('\n');

    this.description = `DLC=${message.dlc}${message.transmittingNode ? `  ${message.transmittingNode}` : ''}`;
    this.iconPath = new vscode.ThemeIcon('mail');
  }
}
