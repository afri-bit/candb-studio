import * as vscode from 'vscode';
import { EventBus } from './shared/events/EventBus';
import { Logger } from './shared/utils/Logger';

// Infrastructure
import { FileSystemRepository } from './infrastructure/repositories/FileSystemRepository';
import { SignalDecoder } from './infrastructure/codec/SignalDecoder';
import { SignalEncoder } from './infrastructure/codec/SignalEncoder';

// Application
import { CanDatabaseService } from './application/services/CanDatabaseService';
import { ValidationService } from './application/services/ValidationService';
import { MonitorService } from './application/services/MonitorService';
import { TransmitService } from './application/services/TransmitService';

// Presentation
import { CommandRegistrar } from './presentation/commands/CommandRegistrar';
import { CanDatabaseEditorProvider } from './presentation/editors/CanDatabaseEditorProvider';
import { CanDatabaseTreeProvider } from './presentation/views/treeview/CanDatabaseTreeProvider';
import { CompletionProvider } from './presentation/providers/CompletionProvider';
import { DiagnosticProvider } from './presentation/providers/DiagnosticProvider';
import { HoverProvider } from './presentation/providers/HoverProvider';
import { ConnectionStatusBar } from './presentation/statusbar/ConnectionStatusBar';
import { SignalLabStatusBar } from './presentation/statusbar/SignalLabStatusBar';
import { SignalLabPanel } from './presentation/signalLab/SignalLabPanel';
import { SignalLabSidebarViewProvider } from './presentation/signalLab/SignalLabSidebarViewProvider';
import { WebviewMessageHandler } from './presentation/webview/WebviewMessageHandler';
import { Commands, SIGNAL_LAB_SIDEBAR_VIEW_ID } from './shared/constants';

export function activate(context: vscode.ExtensionContext): void {
  Logger.initialize();
  Logger.info('Activating candb-studio extension');

  // ── Shared cross-cutting infrastructure ────────────────────────────────
  const eventBus = new EventBus();

  // ── Infrastructure layer ────────────────────────────────────────────────
  const repository = new FileSystemRepository();
  const signalDecoder = new SignalDecoder();
  const signalEncoder = new SignalEncoder();
  void signalEncoder; // available for TransmitService encoding in a future phase

  // ── Application layer ───────────────────────────────────────────────────
  const validationService = new ValidationService();
  const databaseService = new CanDatabaseService(repository, validationService, eventBus);

  // ── Presentation: commands ──────────────────────────────────────────────
  const commandRegistrar = new CommandRegistrar(databaseService, eventBus);
  context.subscriptions.push(...commandRegistrar.registerAll());

  // ── Presentation: webview message handler ──────────────────────────────
  // MonitorService and TransmitService are created lazily after a hardware
  // adapter is connected.  The handler starts with null services and they
  // are injected once the bus connection is established.
  const messageHandler = new WebviewMessageHandler(
    databaseService,
    null,
    null,
    eventBus,
  );

  const signalLabBar = new SignalLabStatusBar(() => {
    const { monitorRunning, periodicIntervals } = messageHandler.getSignalLabBusState();
    return monitorRunning || Object.keys(periodicIntervals).length > 0;
  }, context);

  const signalLabSidebar = new SignalLabSidebarViewProvider(() => messageHandler.getSignalLabHostSnapshot());
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SIGNAL_LAB_SIDEBAR_VIEW_ID, signalLabSidebar),
  );

  const refreshSignalLabHostUi = (): void => {
    signalLabBar.refresh();
    signalLabSidebar.refresh();
  };
  messageHandler.setSignalLabActivityRefresh(refreshSignalLabHostUi);
  context.subscriptions.push({ dispose: eventBus.on('bus:stateChanged', refreshSignalLabHostUi) });
  refreshSignalLabHostUi();

  // ── Bus connectivity: deferred service wiring ───────────────────────────
  // When the ConnectBusCommand establishes an adapter, wire up the bus
  // application services and push them to the command registrar and webview.
  const connectCommand = commandRegistrar.connectCommand;

  connectCommand.onAdapterConnected((adapter) => {
    Logger.info('Bus adapter connected — creating MonitorService and TransmitService');

    const monitorService = new MonitorService(
      adapter,
      signalDecoder,
      eventBus,
      databaseService.getDatabaseForBus(),
    );
    const transmitService = new TransmitService(adapter, eventBus);

    const syncMonitorDatabase = (): void => {
      monitorService.setDatabase(databaseService.getDatabaseForBus());
    };

    const unsubLoaded = eventBus.on('database:loaded', (payload) => {
      if (databaseService.getActiveBusDatabaseUri() === payload.uri) {
        monitorService.setDatabase(payload.database);
      }
    });
    const unsubChanged = eventBus.on('database:changed', (payload) => {
      if (databaseService.getActiveBusDatabaseUri() === payload.uri) {
        monitorService.setDatabase(payload.database);
      }
    });
    const unsubActiveUri = eventBus.on('bus:activeDatabaseUriChanged', () => {
      syncMonitorDatabase();
    });
    context.subscriptions.push({
      dispose: () => {
        unsubLoaded();
        unsubChanged();
        unsubActiveUri();
      },
    });

    commandRegistrar.setMonitorService(monitorService);
    messageHandler.setMonitorService(monitorService);
    messageHandler.setTransmitService(transmitService);
    refreshSignalLabHostUi();

    context.subscriptions.push({
      dispose: () => {
        monitorService.stop();
        transmitService.stopAll();
      },
    });
  });

  connectCommand.onAdapterDisconnected(() => {
    Logger.info('Bus adapter disconnected — tearing down bus services');
    commandRegistrar.setMonitorService(null);
    messageHandler.setMonitorService(null);
    messageHandler.setTransmitService(null);
    refreshSignalLabHostUi();
  });

  // ── Presentation: custom editor for .dbc files ─────────────────────────
  context.subscriptions.push(
    CanDatabaseEditorProvider.register(context, databaseService, messageHandler),
  );

  // ── Presentation: sidebar tree view ────────────────────────────────────
  const { treeView, provider: treeProvider } = CanDatabaseTreeProvider.register(databaseService);
  context.subscriptions.push(treeView);
  context.subscriptions.push({ dispose: eventBus.on('database:loaded', () => treeProvider.refresh()) });
  context.subscriptions.push({ dispose: eventBus.on('database:changed', () => treeProvider.refresh()) });

  // ── Presentation: language feature providers ────────────────────────────
  context.subscriptions.push(CompletionProvider.register());
  context.subscriptions.push(HoverProvider.register(databaseService));
  const diagnosticProvider = new DiagnosticProvider(databaseService);
  context.subscriptions.push(...diagnosticProvider.register());

  // ── Presentation: connection status bar ────────────────────────────────
  const statusBar = new ConnectionStatusBar(eventBus);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.OPEN_SIGNAL_LAB, () =>
      SignalLabPanel.show(context, messageHandler),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.CLOSE_SIGNAL_LAB, () =>
      SignalLabPanel.closeWithConfirm(messageHandler),
    ),
  );

  Logger.info('candb-studio extension activated');
}

export function deactivate(): void {
  Logger.info('candb-studio extension deactivated');
}
