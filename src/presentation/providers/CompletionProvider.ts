import * as vscode from 'vscode';
import { DBC_LANGUAGE_ID } from '../../shared/constants';

const DBC_KEYWORDS = [
  'VERSION', 'NS_', 'BS_', 'BU_', 'BO_', 'SG_', 'CM_',
  'BA_DEF_', 'BA_DEF_DEF_', 'BA_', 'VAL_', 'VAL_TABLE_',
  'SIG_GROUP_', 'EV_', 'SIG_VALTYPE_', 'BO_TX_BU_',
];

/**
 * Provides autocompletion for DBC files.
 * TODO: Add context-aware completion (node names, signal names, attribute names).
 */
export class CompletionProvider implements vscode.CompletionItemProvider {
  static register(): vscode.Disposable {
    return vscode.languages.registerCompletionItemProvider(
      { language: DBC_LANGUAGE_ID },
      new CompletionProvider(),
    );
  }

  provideCompletionItems(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    return DBC_KEYWORDS.map((kw) => {
      const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
      item.detail = 'DBC keyword';
      return item;
    });
  }
}
