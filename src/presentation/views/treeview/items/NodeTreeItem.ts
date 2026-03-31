import * as vscode from 'vscode';
import { BaseTreeItem } from './BaseTreeItem';
import type { Node } from '../../../../core/models/database/Node';

/**
 * Tree item representing a CAN network node (ECU).
 */
export class NodeTreeItem extends BaseTreeItem {
  constructor(public readonly node: Node) {
    super(node.name, vscode.TreeItemCollapsibleState.None, 'canNode');

    this.tooltip = `Node: ${node.name}${node.comment ? `\n${node.comment}` : ''}`;
    this.iconPath = new vscode.ThemeIcon('server');
  }
}
