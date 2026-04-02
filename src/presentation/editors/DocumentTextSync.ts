import * as vscode from 'vscode';

/**
 * Applies full-document text edits for the custom DBC editor so VS Code marks the tab dirty.
 * `isApplying` avoids re-parsing our own writes on `onDidChangeTextDocument`.
 */
export class DocumentTextSync {
    private applying = false;

    isApplying(): boolean {
        return this.applying;
    }

    async replaceDocumentText(document: vscode.TextDocument, newText: string): Promise<boolean> {
        const current = document.getText();
        if (current === newText) {
            return true;
        }
        this.applying = true;
        try {
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(current.length),
            );
            edit.replace(document.uri, fullRange, newText);
            return await vscode.workspace.applyEdit(edit);
        } finally {
            this.applying = false;
        }
    }
}
