import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import type { MonitorService } from '../../application/services/MonitorService';
import type { EventBus } from '../../shared/events/EventBus';
import { OpenDatabaseCommand } from './OpenDatabaseCommand';
import { ConnectBusCommand } from './ConnectBusCommand';
import { DisconnectBusCommand } from './DisconnectBusCommand';
import { Commands } from '../../shared/constants';

/**
 * Registers all extension commands with VS Code.
 * Single entry point for command wiring during extension activation.
 * Holds a reference to the ConnectBusCommand so callers can subscribe to
 * adapter lifecycle events (onAdapterConnected / onAdapterDisconnected).
 */
export class CommandRegistrar {
  private readonly openDatabaseCommand: OpenDatabaseCommand;
  readonly connectCommand: ConnectBusCommand;
  private readonly disconnectCommand: DisconnectBusCommand;

  /** lazily set once a bus connection is established */
  private monitorService: MonitorService | null = null;

  constructor(databaseService: CanDatabaseService, eventBus: EventBus) {
    this.openDatabaseCommand = new OpenDatabaseCommand(databaseService);
    this.connectCommand = new ConnectBusCommand(eventBus);
    this.disconnectCommand = new DisconnectBusCommand(this.connectCommand);
  }

  /** Inject the MonitorService after it has been created on connection. */
  setMonitorService(service: MonitorService | null): void {
    this.monitorService = service;
  }

  registerAll(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand(
        Commands.OPEN_DATABASE,
        () => this.openDatabaseCommand.execute(),
      ),
      vscode.commands.registerCommand(
        Commands.CONNECT_BUS,
        () => this.connectCommand.execute(),
      ),
      vscode.commands.registerCommand(
        Commands.DISCONNECT_BUS,
        () => this.disconnectCommand.execute(),
      ),
      vscode.commands.registerCommand(
        Commands.START_MONITOR,
        () => this.monitorService?.start(),
      ),
      vscode.commands.registerCommand(
        Commands.STOP_MONITOR,
        () => this.monitorService?.stop(),
      ),
    ];
  }
}
