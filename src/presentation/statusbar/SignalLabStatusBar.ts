import * as vscode from 'vscode';
import { Commands } from '../../shared/constants';

const TOOLTIP =
  'CAN Signal Lab — live frames, decode, transmit, charts. Click to open. Use “Close CAN Signal Lab…” to stop the bus from the panel.';
const BLINK_MS = 500;

/**
 * Single status bar entry for Signal Lab. When monitor or periodic transmit is active,
 * the whole item (text + background) pulses with green emphasis.
 */
export class SignalLabStatusBar {
  private readonly item: vscode.StatusBarItem;
  private blinkTimer: ReturnType<typeof setInterval> | undefined;
  private blinkPhase = false;

  constructor(
    private readonly getActive: () => boolean,
    context: vscode.ExtensionContext,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.item.command = Commands.OPEN_SIGNAL_LAB;
    this.item.tooltip = TOOLTIP;
    this.item.text = '$(pulse) CAN Signal Lab';

    context.subscriptions.push(this.item);
    context.subscriptions.push({ dispose: () => this.clearBlinkTimer() });
  }

  refresh(): void {
    const active = this.getActive();
    this.clearBlinkTimer();

    if (!active) {
      this.item.text = '$(pulse) CAN Signal Lab';
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    this.item.text = '$(pulse) CAN Signal Lab';
    const tick = (): void => {
      this.blinkPhase = !this.blinkPhase;
      if (this.blinkPhase) {
        this.item.color = new vscode.ThemeColor('charts.green');
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
      } else {
        this.item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
      }
    };
    tick();
    this.blinkTimer = setInterval(tick, BLINK_MS);
    this.item.show();
  }

  private clearBlinkTimer(): void {
    if (this.blinkTimer !== undefined) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = undefined;
    }
  }
}
