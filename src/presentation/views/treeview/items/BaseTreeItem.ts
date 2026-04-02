import * as vscode from 'vscode';

/**
 * Base class for all CAN database tree view items.
 */
export class BaseTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly contextType: string = '',
    ) {
        super(label, collapsibleState);
        if (contextType) {
            this.contextValue = contextType;
        }
    }
}
