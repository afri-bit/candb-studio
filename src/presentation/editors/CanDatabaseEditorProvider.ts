import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import { DBC_EDITOR_VIEW_TYPE } from '../../shared/constants';
import { Logger } from '../../shared/utils/Logger';
import { messageForUser } from '../../shared/utils/errorUtils';
import type { WebviewMessageHandler } from '../webview/WebviewMessageHandler';

/**
 * Custom editor provider for .dbc files.
 * Opens DBC files in a Svelte-based webview editor instead of the plain text editor.
 */
export class CanDatabaseEditorProvider implements vscode.CustomTextEditorProvider {
    static readonly viewType = DBC_EDITOR_VIEW_TYPE;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly databaseService: CanDatabaseService,
        private readonly webviewMessageHandler: WebviewMessageHandler,
    ) {}

    static register(
        context: vscode.ExtensionContext,
        databaseService: CanDatabaseService,
        webviewMessageHandler: WebviewMessageHandler,
    ): vscode.Disposable {
        const provider = new CanDatabaseEditorProvider(
            context,
            databaseService,
            webviewMessageHandler,
        );
        return vscode.window.registerCustomEditorProvider(
            CanDatabaseEditorProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } },
        );
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        try {
            webviewPanel.webview.options = {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist'),
                ],
            };

            // Attach and paint the webview first so resolveCustomTextEditor returns quickly.
            const messageSubscription = this.webviewMessageHandler.attach(webviewPanel, document);
            webviewPanel.onDidDispose(() => messageSubscription.dispose());

            webviewPanel.webview.html = await this.buildHtml(webviewPanel.webview);

            // Defer parse so this handler returns before sync parse.
            queueMicrotask(() => {
                void this.loadDatabaseForEditor(document);
            });

            const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.uri.toString() !== document.uri.toString()) {
                    return;
                }
                if (this.webviewMessageHandler.isDocumentSyncApplying(document.uri.toString())) {
                    return;
                }
                void this.loadDatabaseForEditor(document);
            });

            webviewPanel.onDidDispose(() => changeSubscription.dispose());
        } catch (err: unknown) {
            Logger.error('resolveCustomTextEditor failed', err);
            const msg = messageForUser(err);
            void vscode.window.showErrorMessage(`CAN Database Editor failed to open: ${msg}`);
            webviewPanel.webview.html = /* html */ `<!DOCTYPE html><html><body style="font-family:system-ui;padding:16px;color:#ccc"><p>Could not load the editor UI. Run <code>npm run compile</code> in the extension project (builds webview-ui + webpack), then reload the window.</p><p>${msg}</p></body></html>`;
        }
    }

    private async loadDatabaseForEditor(document: vscode.TextDocument): Promise<void> {
        try {
            this.databaseService.loadFromTextDocument(document);
        } catch (err: unknown) {
            Logger.error('Failed to load database for editor', err);
            const msg = messageForUser(err);
            void vscode.window.showErrorMessage(`Could not parse DBC file: ${msg}`);
            this.webviewMessageHandler.sendEmptyDatabase(document.uri.toString());
        }
    }

    /**
     * Loads `webview-ui/dist/index.html` from the extension bundle and rewrites
     * script/link URLs to `vscode-webview://` URIs. Run `npm run build:webview`
     * before packaging or debugging if assets are missing.
     */
    private async buildHtml(webview: vscode.Webview): Promise<string> {
        const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview-ui', 'dist');
        const htmlDiskPath = path.join(distUri.fsPath, 'index.html');

        try {
            let html: string;
            try {
                html = await fs.readFile(htmlDiskPath, 'utf8');
            } catch (diskErr: unknown) {
                Logger.warn(
                    `Could not read webview from ${htmlDiskPath}, trying workspace.fs: ${messageForUser(diskErr)}`,
                );
                const bytes = await vscode.workspace.fs.readFile(
                    vscode.Uri.joinPath(distUri, 'index.html'),
                );
                html = Buffer.from(bytes).toString('utf8');
            }

            html = html.replace(
                /<div id="app"><\/div>/i,
                '<div id="app"><p style="padding:12px;margin:0;font-family:system-ui,sans-serif;opacity:0.9">Loading CAN Database Editor…</p></div>',
            );

            html = html.replace(/(src|href)="([^"]+)"/g, (_match, attr: string, uri: string) => {
                if (uri.startsWith('http') || uri.startsWith('data:')) {
                    return `${attr}="${uri}"`;
                }
                const rel = uri.replace(/^\.\//, '');
                const assetUri = vscode.Uri.joinPath(distUri, rel);
                return `${attr}="${webview.asWebviewUri(assetUri)}"`;
            });

            // Vite adds crossorigin; anonymous CORS mode often blocks scripts in vscode-webview://
            html = html.replace(/\s+crossorigin(?:="[^"]*")?/gi, '');

            const csp = [
                "default-src 'none'",
                `style-src ${webview.cspSource} 'unsafe-inline'`,
                `script-src ${webview.cspSource}`,
                `script-src-elem ${webview.cspSource}`,
                `worker-src ${webview.cspSource} blob:`,
                `font-src ${webview.cspSource}`,
                `img-src ${webview.cspSource} data:`,
                `connect-src ${webview.cspSource}`,
            ].join('; ');

            if (html.includes('Content-Security-Policy')) {
                html = html.replace(
                    /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i,
                    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
                );
            } else {
                html = html.replace(
                    '<head>',
                    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">\n`,
                );
            }

            return html;
        } catch (err: unknown) {
            Logger.error('webview-ui/dist/index.html not found — run npm run build:webview', err);
            const nonce = this.nonce();
            return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CAN Database Editor</title>
        <style nonce="${nonce}">
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
          .placeholder { text-align: center; margin-top: 20%; opacity: 0.6; }
          code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="placeholder">
          <h2>CAN Database Editor</h2>
          <p>Run a full compile (webview + extension):</p>
          <p><code>npm run compile</code></p>
          <p>Ensure F5 uses the <code>npm: compile</code> preLaunch task, then reload.</p>
        </div>
      </body>
      </html>`;
        }
    }

    private nonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(
            { length: 32 },
            () => chars[Math.floor(Math.random() * chars.length)],
        ).join('');
    }
}
