import * as vscode from 'vscode';
import type { Signal } from '../../../../core/models/database/Signal';
import { BaseTreeItem } from './BaseTreeItem';

function buildTooltip(signal: Signal): vscode.MarkdownString {
    const md = new vscode.MarkdownString(
        [
            '**Unlinked pool signal**',
            '',
            'This definition exists in the global pool but is not assigned to any message frame. It is serialized in the DBC extension block until you link it from the Messages editor (or remove it from the pool if unused).',
            '',
            '---',
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
    return md;
}

/**
 * Tree item for a pool signal that is not referenced by any message (dangling / unlinked).
 * Warning theme icon (triangle) plus Markdown tooltip with explanation and signal fields.
 */
export class PoolSignalTreeItem extends BaseTreeItem {
    constructor(public readonly signal: Signal) {
        super(signal.name, vscode.TreeItemCollapsibleState.None, 'canPoolSignalUnlinked');

        this.tooltip = buildTooltip(signal);

        this.description = `pool only · [${signal.startBit}|${signal.bitLength}] ${signal.unit || '—'}`;
        this.iconPath = new vscode.ThemeIcon(
            'warning',
            new vscode.ThemeColor('editorWarning.foreground'),
        );
    }
}
