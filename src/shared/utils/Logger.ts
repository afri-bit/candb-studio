import * as vscode from 'vscode';
import { EXTENSION_ID } from '../constants';
import { formatUnknownError } from './errorUtils';

/**
 * Centralized logger that writes to a VS Code OutputChannel.
 * Call Logger.initialize() once during extension activation.
 */
export class Logger {
    private static channel: vscode.OutputChannel | undefined;

    /** Creates the output channel used for all subsequent log lines. Idempotent. */
    static initialize(): void {
        if (!Logger.channel) {
            Logger.channel = vscode.window.createOutputChannel(EXTENSION_ID);
        }
    }

    /** Writes an INFO line to the extension output channel. */
    static info(message: string): void {
        Logger.log('INFO', message);
    }

    /** Writes a WARN line to the extension output channel. */
    static warn(message: string): void {
        Logger.log('WARN', message);
    }

    /**
     * Writes an ERROR line; if `error` is set, appends stack (for `Error`) or a stringified value.
     *
     * @param message - Human-readable context (what failed).
     * @param error - Optional thrown value or rejection reason (`unknown` at catch boundaries).
     */
    static error(message: string, error?: unknown): void {
        Logger.log('ERROR', message);
        if (error === undefined) {
            return;
        }
        if (error instanceof Error) {
            Logger.log('ERROR', error.stack ?? error.message);
        } else {
            Logger.log('ERROR', formatUnknownError(error));
        }
    }

    /** Single timestamped line to the output channel. */
    private static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        Logger.channel?.appendLine(`[${timestamp}] [${level}] ${message}`);
    }
}
