import * as vscode from 'vscode';
import { EXTENSION_ID } from '../constants';

/**
 * Centralized logger that writes to a VS Code OutputChannel.
 * Call Logger.initialize() once during extension activation.
 */
export class Logger {
  private static channel: vscode.OutputChannel | undefined;

  static initialize(): void {
    if (!Logger.channel) {
      Logger.channel = vscode.window.createOutputChannel(EXTENSION_ID);
    }
  }

  static info(message: string): void {
    Logger.log('INFO', message);
  }

  static warn(message: string): void {
    Logger.log('WARN', message);
  }

  static error(message: string, error?: unknown): void {
    Logger.log('ERROR', message);
    if (error instanceof Error) {
      Logger.log('ERROR', error.stack ?? error.message);
    }
  }

  private static log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    Logger.channel?.appendLine(`[${timestamp}] [${level}] ${message}`);
  }
}
