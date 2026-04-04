import * as vscode from 'vscode';
import type { CanDatabase } from '../../../../core/models/database/CanDatabase';
import type { Signal } from '../../../../core/models/database/Signal';
import { BaseTreeItem } from './BaseTreeItem';

/**
 * One row under **Signals** (global pool) — pool definition, linked or not.
 */
export class PoolSignalListTreeItem extends BaseTreeItem {
    constructor(
        signal: Signal,
        database: CanDatabase,
    ) {
        const linked = database.isSignalReferencedByMessage(signal.name);
        super(signal.name, vscode.TreeItemCollapsibleState.None, 'canPoolSignalListEntry');

        this.description = linked
            ? `[${signal.startBit}|${signal.bitLength}] · linked`
            : `[${signal.startBit}|${signal.bitLength}] · unlinked`;
        // Match DatabaseExplorer `sym-signal` — Codicon `pulse` (same as SignalTreeItem under Messages).
        this.iconPath = new vscode.ThemeIcon('pulse');

        const md = new vscode.MarkdownString(
            [
                linked
                    ? '**Pool signal** — referenced by at least one message frame.'
                    : '**Pool signal** — not placed on any message (DBC extension block until linked).',
                '',
                `Start bit: ${signal.startBit}`,
                `Length: ${signal.bitLength} bits`,
                `Byte order: ${signal.byteOrder === 0 ? 'Intel (LE)' : 'Motorola (BE)'}`,
                `Factor: ${signal.factor}`,
                `Offset: ${signal.offset}`,
                `Range: [${signal.minimum}, ${signal.maximum}]`,
                `Unit: ${signal.unit || 'N/A'}`,
            ].join('\n'),
        );
        md.isTrusted = true;
        this.tooltip = md;
    }
}
