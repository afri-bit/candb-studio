import * as vscode from 'vscode';
import { CanBusState } from '../../core/enums/CanBusState';
import { Commands, SIGNAL_LAB_SIDEBAR_VIEW_ID } from '../../shared/constants';

export type SignalLabHostSnapshot = {
    busState: CanBusState;
    monitorRunning: boolean;
    periodicIntervals: Record<number, number>;
};

/**
 * Compact sidebar webview next to CAN Database: connection + activity + open full Signal Lab.
 */
export class SignalLabSidebarViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = SIGNAL_LAB_SIDEBAR_VIEW_ID;

    private view?: vscode.WebviewView;

    constructor(private readonly getSnapshot: () => SignalLabHostSnapshot) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.html = this.buildHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((msg: { type?: string }) => {
            if (msg?.type === 'ready') {
                this.pushState(webviewView.webview);
                return;
            }
            if (msg?.type === 'open') {
                void vscode.commands.executeCommand(Commands.OPEN_SIGNAL_LAB);
            }
        });

        webviewView.onDidDispose(() => {
            this.view = undefined;
        });

        this.pushState(webviewView.webview);
    }

    /** Push latest snapshot to the sidebar (no-op if not visible). */
    refresh(): void {
        const w = this.view?.webview;
        if (w) {
            this.pushState(w);
        }
    }

    private pushState(webview: vscode.Webview): void {
        const s = this.getSnapshot();
        const activity = s.monitorRunning || Object.keys(s.periodicIntervals).length > 0;
        void webview.postMessage({
            type: 'state',
            busLabel: busStateLabel(s.busState),
            monitorLabel: s.monitorRunning ? 'Monitor: running' : 'Monitor: stopped',
            periodicLabel:
                Object.keys(s.periodicIntervals).length === 0
                    ? 'Periodic TX: none'
                    : `Periodic TX: ${Object.keys(s.periodicIntervals).length} frame(s)`,
            activity,
        });
    }

    private buildHtml(webview: vscode.Webview): string {
        const csp = [
            "default-src 'none'",
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src ${webview.cspSource}`,
        ].join('; ');

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --sl-muted: var(--vscode-descriptionForeground);
      --sl-green: var(--vscode-charts-green, #89d185);
    }
    body {
      margin: 0;
      padding: 10px 12px 12px;
      font-size: 12px;
      line-height: 1.45;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    h2 {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--sl-muted);
    }
    .row { margin-bottom: 6px; }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: middle;
      background: var(--sl-muted);
    }
    .dot.on {
      background: var(--sl-green);
      animation: pulse 0.9s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; filter: brightness(1); }
      50% { opacity: 0.45; filter: brightness(0.85); }
    }
    button {
      margin-top: 10px;
      width: 100%;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
      border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .hint {
      margin-top: 10px;
      font-size: 11px;
      color: var(--sl-muted);
    }
  </style>
</head>
<body>
  <h2>Signal Lab</h2>
  <div class="row"><span id="dot" class="dot"></span><span id="bus"></span></div>
  <div class="row" id="mon"></div>
  <div class="row" id="per"></div>
  <button type="button" id="open">Open CAN Signal Lab</button>
  <p class="hint">Full monitor, decode, transmit, and charts open in the editor area.</p>
  <script>
    const vscode = acquireVsCodeApi();
    const dot = document.getElementById('dot');
    const bus = document.getElementById('bus');
    const mon = document.getElementById('mon');
    const per = document.getElementById('per');
    const openBtn = document.getElementById('open');
    function apply(data) {
      if (!data || data.type !== 'state') return;
      bus.textContent = data.busLabel;
      mon.textContent = data.monitorLabel;
      per.textContent = data.periodicLabel;
      dot.classList.toggle('on', !!data.activity);
    }
    window.addEventListener('message', function (e) { apply(e.data); });
    openBtn.addEventListener('click', function () { vscode.postMessage({ type: 'open' }); });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
}

function busStateLabel(state: CanBusState): string {
    switch (state) {
        case CanBusState.Connected:
            return 'Bus: connected';
        case CanBusState.Connecting:
            return 'Bus: connecting…';
        case CanBusState.Error:
            return 'Bus: error';
        case CanBusState.BusOff:
            return 'Bus: bus off';
        default:
            return 'Bus: disconnected';
    }
}
