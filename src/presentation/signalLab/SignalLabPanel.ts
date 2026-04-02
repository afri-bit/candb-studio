import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { WebviewMessageHandler } from '../webview/WebviewMessageHandler';
import { Logger } from '../../shared/utils/Logger';
import { EXTENSION_ID } from '../../shared/constants';

const PANEL_VIEW_TYPE = `${EXTENSION_ID}.signalLab`;

/**
 * Singleton webview for live CAN monitoring and transmit (Signal Lab).
 * Second invocation reveals the existing panel.
 */
export class SignalLabPanel {
  private static panel: vscode.WebviewPanel | undefined;

  /**
   * Close the panel after an optional confirmation. Does not stop the bus unless the user picks “Stop bus & close”.
   */
  static async closeWithConfirm(messageHandler: WebviewMessageHandler): Promise<void> {
    const panel = SignalLabPanel.panel;
    if (!panel) {
      void vscode.window.showInformationMessage('CAN Signal Lab is not open.');
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      'Close CAN Signal Lab?',
      {
        modal: true,
        detail:
          'Monitoring and periodic transmit keep running in the background if you only close the panel. Stop the bus here if you want to halt them.',
      },
      'Close',
      'Stop bus & close',
      'Cancel',
    );
    if (choice === 'Cancel' || choice === undefined) {
      return;
    }
    if (choice === 'Stop bus & close') {
      messageHandler.stopSignalLabBusActivity();
    }
    panel.dispose();
  }

  static async show(context: vscode.ExtensionContext, messageHandler: WebviewMessageHandler): Promise<void> {
    if (SignalLabPanel.panel) {
      SignalLabPanel.panel.reveal(vscode.ViewColumn.Beside);
      messageHandler.pushSignalLabState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      'CAN Signal Lab',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')],
      },
    );

    SignalLabPanel.panel = panel;

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')],
    };

    const attachDisposable = messageHandler.attachSignalLab(panel);

    panel.onDidDispose(() => {
      attachDisposable.dispose();
      SignalLabPanel.panel = undefined;
    });

    try {
      panel.webview.html = await SignalLabPanel.buildHtml(context, panel.webview);
    } catch (error) {
      Logger.error('Signal Lab webview HTML failed', error);
      const msg = error instanceof Error ? error.message : String(error);
      panel.webview.html = /* html */ `<!DOCTYPE html><html><body style="font-family:system-ui;padding:16px;color:#ccc"><p>Could not load Signal Lab. Run <code>npm run compile</code>, then reload the window.</p><p>${msg}</p></body></html>`;
    }
  }

  private static async buildHtml(context: vscode.ExtensionContext, webview: vscode.Webview): Promise<string> {
    const distUri = vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist');
    const htmlDiskPath = path.join(distUri.fsPath, 'signal-lab.html');

    let html: string;
    try {
      try {
        html = await fs.readFile(htmlDiskPath, 'utf8');
      } catch (diskErr) {
        Logger.warn(
          `Could not read Signal Lab HTML from ${htmlDiskPath}, trying workspace.fs: ${diskErr instanceof Error ? diskErr.message : String(diskErr)}`,
        );
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(distUri, 'signal-lab.html'));
        html = Buffer.from(bytes).toString('utf8');
      }

      html = html.replace(
        /<div id="app"><\/div>/i,
        '<div id="app"><p style="padding:12px;margin:0;font-family:system-ui,sans-serif;opacity:0.9">Loading Signal Lab…</p></div>',
      );

      html = html.replace(
        /(src|href)="([^"]+)"/g,
        (_match, attr: string, uri: string) => {
          if (uri.startsWith('http') || uri.startsWith('data:')) {
            return `${attr}="${uri}"`;
          }
          const rel = uri.replace(/^\.\//, '');
          const assetUri = vscode.Uri.joinPath(distUri, rel);
          return `${attr}="${webview.asWebviewUri(assetUri)}"`;
        },
      );

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
        html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">\n`);
      }

      return html;
    } catch (error) {
      Logger.error('webview-ui/dist/signal-lab.html not found — run npm run build:webview', error);
      throw error;
    }
  }
}
