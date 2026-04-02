import * as vscode from 'vscode';
import type { Signal } from '../../../../core/models/database/Signal';
import { BaseTreeItem } from './BaseTreeItem';

/**
 * Tree item representing a signal within a CAN message.
 */
export class SignalTreeItem extends BaseTreeItem {
    constructor(public readonly signal: Signal) {
        super(signal.name, vscode.TreeItemCollapsibleState.None, 'canSignal');

        this.tooltip = [
            `Start bit: ${signal.startBit}`,
            `Length: ${signal.bitLength} bits`,
            `Byte order: ${signal.byteOrder === 0 ? 'Intel (LE)' : 'Motorola (BE)'}`,
            `Factor: ${signal.factor}`,
            `Offset: ${signal.offset}`,
            `Range: [${signal.minimum}, ${signal.maximum}]`,
            `Unit: ${signal.unit || 'N/A'}`,
        ].join('\n');

        this.description = `[${signal.startBit}|${signal.bitLength}] ${signal.unit}`;
        this.iconPath = new vscode.ThemeIcon('pulse');
    }
}
