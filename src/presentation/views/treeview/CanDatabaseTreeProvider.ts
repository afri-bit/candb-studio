import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../../application/services/CanDatabaseService';
import { CAN_DATABASE_TREE_VIEW_ID } from '../../../shared/constants';
import { BaseTreeItem } from './items/BaseTreeItem';
import { MessageTreeItem } from './items/MessageTreeItem';
import { NodeTreeItem } from './items/NodeTreeItem';
import { PoolSignalTreeItem } from './items/PoolSignalTreeItem';
import { SignalTreeItem } from './items/SignalTreeItem';

/**
 * Tree data provider for the CAN database browser sidebar.
 * Displays nodes, messages, and signals in a hierarchical tree.
 */
export class CanDatabaseTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BaseTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

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
        return { provider, treeView };
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: BaseTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BaseTreeItem): BaseTreeItem[] {
        const database = this.databaseService.getDatabase();
        if (!database) {
            return [new BaseTreeItem('No database loaded')];
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

        if (element.contextType === 'unlinkedSignalsCategory') {
            const database = this.databaseService.getDatabase()!;
            return database.signalPool
                .filter((s) => !database.isSignalReferencedByMessage(s.name))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                .map((sig) => new PoolSignalTreeItem(sig));
        }

        return [];
    }

    private getRootItems(
        database: ReturnType<CanDatabaseService['getDatabase']> & {},
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

        return [nodesItem, messagesItem, unlinkedItem];
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
