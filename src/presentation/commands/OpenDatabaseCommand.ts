import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import { Commands } from '../../shared/constants';
import { Logger } from '../../shared/utils/Logger';
import { messageForUser } from '../../shared/utils/errorUtils';

/**
 * Command to open and load a CAN database file (.dbc) from disk.
 */
export class OpenDatabaseCommand {
    static readonly ID = Commands.OPEN_DATABASE;

    constructor(private readonly databaseService: CanDatabaseService) {}

    async execute(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'CAN Database': ['dbc'] },
            title: 'Open CAN Database',
        });

        if (!uris || uris.length === 0) {
            return;
        }

        try {
            const database = await this.databaseService.load(uris[0].fsPath);
            Logger.info(
                `Loaded database: ${database.messages.length} messages, ${database.nodes.length} nodes`,
            );
            vscode.window.showInformationMessage(
                `Loaded CAN database: ${database.messages.length} messages`,
            );
        } catch (err: unknown) {
            Logger.error('Failed to open database', err);
            vscode.window.showErrorMessage(`Failed to open CAN database: ${messageForUser(err)}`);
        }
    }
}
