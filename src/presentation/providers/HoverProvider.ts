import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import { DBC_LANGUAGE_ID } from '../../shared/constants';

/**
 * Provides hover information for DBC files.
 * Shows details about messages, signals, and nodes when the user hovers.
 */
export class HoverProvider implements vscode.HoverProvider {
  constructor(private readonly databaseService: CanDatabaseService) {}

  static register(databaseService: CanDatabaseService): vscode.Disposable {
    return vscode.languages.registerHoverProvider(
      { language: DBC_LANGUAGE_ID },
      new HoverProvider(databaseService),
    );
  }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover | null {
    const database = this.databaseService.getDatabase();
    if (!database) {
      return null;
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);

    const message = database.findMessageByName(word);
    if (message) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**Message: ${message.name}**\n\n`);
      md.appendMarkdown(`- ID: \`${message.idHex}\`\n`);
      md.appendMarkdown(`- DLC: ${message.dlc}\n`);
      md.appendMarkdown(`- Transmitter: ${message.transmittingNode || 'N/A'}\n`);
      md.appendMarkdown(`- Signals: ${message.signalRefs.length}\n`);
      return new vscode.Hover(md, wordRange);
    }

    const node = database.findNodeByName(word);
    if (node) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**Node: ${node.name}**\n\n`);
      if (node.comment) {
        md.appendMarkdown(`${node.comment}\n`);
      }
      return new vscode.Hover(md, wordRange);
    }

    // TODO: Check signals, attributes, environment variables
    return null;
  }
}
