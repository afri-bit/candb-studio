import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import { DiagnosticSeverity } from '../../core/types';
import { DBC_LANGUAGE_ID } from '../../shared/constants';
import { Logger } from '../../shared/utils/Logger';

/**
 * Provides VS Code diagnostics (errors/warnings) for DBC files.
 * Re-validates the loaded database whenever the document changes.
 */
export class DiagnosticProvider {
    private collection: vscode.DiagnosticCollection;

    constructor(private readonly databaseService: CanDatabaseService) {
        this.collection = vscode.languages.createDiagnosticCollection(DBC_LANGUAGE_ID);
    }

    register(): vscode.Disposable[] {
        return [
            this.collection,
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.languageId === DBC_LANGUAGE_ID) {
                    this.update(e.document);
                }
            }),
            vscode.workspace.onDidOpenTextDocument((doc) => {
                if (doc.languageId === DBC_LANGUAGE_ID) {
                    this.update(doc);
                }
            }),
        ];
    }

    private update(document: vscode.TextDocument): void {
        try {
            const results = this.databaseService.validate();
            const diagnostics = results.map((item) => {
                const severity =
                    item.severity === DiagnosticSeverity.Error
                        ? vscode.DiagnosticSeverity.Error
                        : item.severity === DiagnosticSeverity.Warning
                          ? vscode.DiagnosticSeverity.Warning
                          : vscode.DiagnosticSeverity.Information;

                // TODO: Map item.path to actual line/column ranges in the document
                const range = new vscode.Range(0, 0, 0, 0);
                const d = new vscode.Diagnostic(range, item.message, severity);
                d.source = 'CAN Database';
                return d;
            });

            this.collection.set(document.uri, diagnostics);
        } catch (err: unknown) {
            Logger.error('Failed to update diagnostics', err);
        }
    }
}
