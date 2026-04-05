import * as path from 'path';
import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../../application/services/CanDatabaseService';
import { CAN_DATABASE_TREE_VIEW_ID } from '../../../shared/constants';
import { BaseTreeItem } from './items/BaseTreeItem';
import { MessageTreeItem } from './items/MessageTreeItem';
import { NodeTreeItem } from './items/NodeTreeItem';
import { PoolSignalListTreeItem } from './items/PoolSignalListTreeItem';
import { PoolSignalTreeItem } from './items/PoolSignalTreeItem';
import { SignalTreeItem } from './items/SignalTreeItem';

/**
 * Sidebar tree for the **active bus decode database** (`getDatabaseForBus`), aligned with CAN Signal Lab
 * session selection. Unlinking decode clears the tree until another session is active.
 */
export class CanDatabaseTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BaseTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private treeView: vscode.TreeView<BaseTreeItem> | undefined;

    constructor(private readonly databaseService: CanDatabaseService) {}

    static register(databaseService: CanDatabaseService): {
        provider: CanDatabaseTreeProvider;
        treeView: vscode.TreeView<BaseTreeItem>;
    } {
        const provider = new CanDatabaseTreeProvider(databaseService);
        const treeView = vscode.window.createTreeView(CAN_DATABASE_TREE_VIEW_ID, {
            treeDataProvider: provider,
            showCollapseAll: true,
        });
        provider.treeView = treeView;
        provider.refresh();
        return { provider, treeView };
    }

    refresh(): void {
        this.updateTreeChrome();
        this._onDidChangeTreeData.fire();
    }

    /** Title-area hint + empty-state message (VS Code renders `message` when the tree is empty). */
    private updateTreeChrome(): void {
        const tv = this.treeView;
        if (!tv) {
            return;
        }
        const activeUri = this.databaseService.getActiveBusDatabaseUri();
        const busDb = this.databaseService.getDatabaseForBus();
        const sessionCount = this.databaseService.getSessionUris().length;

        if (!busDb || !activeUri) {
            tv.description = undefined;
            tv.message =
                sessionCount > 0
                    ? 'No active database for bus decode. Pick a loaded .dbc in CAN Signal Lab (session list), or open one first.'
                    : 'No database loaded. Open a .dbc file — it becomes the active decode database until you unlink it in Signal Lab.';
            return;
        }

        try {
            const label = path.basename(vscode.Uri.parse(activeUri).fsPath);
            tv.description = label || 'active session';
        } catch {
            tv.description = 'active session';
        }
        tv.message = undefined;
    }

    getTreeItem(element: BaseTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BaseTreeItem): BaseTreeItem[] {
        const database = this.databaseService.getDatabaseForBus();
        if (!database) {
            return [];
        }

        if (!element) {
            return this.getRootItems(database);
        }

        if (element.contextType === 'nodesCategory') {
            return database.nodes.map((node) => new NodeTreeItem(node));
        }

        if (element.contextType === 'messagesCategory') {
            return database.messages.map((msg) => new MessageTreeItem(msg, database));
        }

        if (element instanceof MessageTreeItem) {
            return element.message
                .getResolvedSignals(element.database.signalPool, element.database)
                .map((sig) => new SignalTreeItem(sig));
        }

        if (element.contextType === 'signalListCategory') {
            return [...database.signalPool]
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                .map((sig) => new PoolSignalListTreeItem(sig, database));
        }

        if (element.contextType === 'unlinkedSignalsCategory') {
            const database = this.databaseService.getDatabaseForBus()!;
            return database.signalPool
                .filter((s) => !database.isSignalReferencedByMessage(s.name))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                .map((sig) => new PoolSignalTreeItem(sig));
        }

        return [];
    }

    private getRootItems(
        database: NonNullable<ReturnType<CanDatabaseService['getDatabaseForBus']>>,
    ): BaseTreeItem[] {
        const nodesItem = new BaseTreeItem(
            `Nodes (${database.nodes.length})`,
            database.nodes.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'nodesCategory',
        );
        nodesItem.iconPath = new vscode.ThemeIcon('server-environment');

        const messagesItem = new BaseTreeItem(
            `Messages (${database.messages.length})`,
            database.messages.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'messagesCategory',
        );
        messagesItem.iconPath = new vscode.ThemeIcon('list-tree');

        const pool = database.signalPool;
        const signalListItem = new BaseTreeItem(
            `Signals (${pool.length})`,
            pool.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'signalListCategory',
        );
        signalListItem.iconPath = new vscode.ThemeIcon('pulse');
        {
            const md = new vscode.MarkdownString(
                [
                    '**Global signal pool**',
                    '',
                    'All signals in this database (A–Z). “Linked” means at least one message references this pool signal; expand **Messages** to see per-frame layout.',
                ].join('\n'),
            );
            md.isTrusted = true;
            signalListItem.tooltip = md;
        }

        const unlinked = database.signalPool.filter(
            (s) => !database.isSignalReferencedByMessage(s.name),
        );
        const unlinkedItem = new BaseTreeItem(
            `Unlinked signals (${unlinked.length})`,
            unlinked.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'unlinkedSignalsCategory',
        );
        unlinkedItem.iconPath =
            unlinked.length > 0
                ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'))
                : new vscode.ThemeIcon('pass');
        {
            const md = new vscode.MarkdownString(
                [
                    '**Signals in the pool only**',
                    '',
                    unlinked.length === 0
                        ? 'Every pool signal is assigned to at least one message.'
                        : `${unlinked.length} signal(s) are not linked to any message frame. Expand to review them — they serialize in the DBC extension block until linked.`,
                ].join('\n'),
            );
            md.isTrusted = true;
            unlinkedItem.tooltip = md;
        }

        return [nodesItem, messagesItem, signalListItem, unlinkedItem];
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
