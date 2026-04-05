import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../../application/services/CanDatabaseService';
import { SIGNAL_LAB_SIDEBAR_VIEW_ID } from '../../../shared/constants';
import { BaseTreeItem } from './items/BaseTreeItem';
import { MessageTreeItem } from './items/MessageTreeItem';
import { NodeTreeItem } from './items/NodeTreeItem';
import { PoolSignalListTreeItem } from './items/PoolSignalListTreeItem';
import { PoolSignalTreeItem } from './items/PoolSignalTreeItem';
import { SignalTreeItem } from './items/SignalTreeItem';

/**
 * Signal Lab sidebar: database outline for decode/transmit context —
 * nodes, messages → signals, full pool list, and unlinked pool signals.
 */
export class SignalLabSidebarTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BaseTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly databaseService: CanDatabaseService) {}

    static register(databaseService: CanDatabaseService): {
        provider: SignalLabSidebarTreeProvider;
        treeView: vscode.TreeView<BaseTreeItem>;
    } {
        const provider = new SignalLabSidebarTreeProvider(databaseService);
        const treeView = vscode.window.createTreeView(SIGNAL_LAB_SIDEBAR_VIEW_ID, {
            treeDataProvider: provider,
            showCollapseAll: true,
        });
        return { provider, treeView };
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
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
            const db = this.databaseService.getDatabaseForBus()!;
            return db.signalPool
                .filter((s) => !db.isSignalReferencedByMessage(s.name))
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
                    'All signals defined in the database (sorted by name). “Linked” means at least one message references this pool signal.',
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
                        : `${unlinked.length} signal(s) are not linked to any message frame.`,
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
