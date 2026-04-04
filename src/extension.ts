import * as vscode from 'vscode';
import { EventBus } from './shared/events/EventBus';
import { Logger } from './shared/utils/Logger';

// Infrastructure
import { SignalDecoder } from './infrastructure/codec/SignalDecoder';
import { SignalEncoder } from './infrastructure/codec/SignalEncoder';
import { FileSystemRepository } from './infrastructure/repositories/FileSystemRepository';

// Application
import { CanDatabaseService } from './application/services/CanDatabaseService';
import { MonitorService } from './application/services/MonitorService';
import { TransmitService } from './application/services/TransmitService';
import { ValidationService } from './application/services/ValidationService';
import { VirtualBusSimulationService } from './application/services/VirtualBusSimulationService';

// Presentation
import { CommandRegistrar } from './presentation/commands/CommandRegistrar';
import { CanDatabaseEditorProvider } from './presentation/editors/CanDatabaseEditorProvider';
import { CompletionProvider } from './presentation/providers/CompletionProvider';
import { DiagnosticProvider } from './presentation/providers/DiagnosticProvider';
import { HoverProvider } from './presentation/providers/HoverProvider';
import { SignalLabPanel } from './presentation/signalLab/SignalLabPanel';
import { ConnectionStatusBar } from './presentation/statusbar/ConnectionStatusBar';
import { SignalLabStatusBar } from './presentation/statusbar/SignalLabStatusBar';
import { CanDatabaseTreeProvider } from './presentation/views/treeview/CanDatabaseTreeProvider';
// Signal Lab sidebar tree off. Re-enable: package.json → activationEvents add
// "onView:candb-studio.signalLabSidebar"; contributes.views.canbus-explorer add the Signal Lab view object;
// then uncomment import, register block, and signalLabTreeProvider.refresh() below.
// import { SignalLabSidebarTreeProvider } from './presentation/views/treeview/SignalLabSidebarTreeProvider';
import { WebviewMessageHandler } from './presentation/webview/WebviewMessageHandler';
import { VirtualCanAdapter } from './infrastructure/adapters/VirtualCanAdapter';
import { Commands } from './shared/constants';

/**
 * VS Code extension activation: wires the event bus, repository, application services,
 * custom editor, tree, language features, bus commands, and Signal Lab UI.
 *
 * @param context - Extension context for registering disposables and commands.
 */
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

    const virtualBusSimulationService = new VirtualBusSimulationService(
        () => databaseService.getDatabaseForBus(),
        eventBus,
    );
    commandRegistrar.connectCommand.setVirtualBusSimulationService(virtualBusSimulationService);

    // ── Presentation: webview message handler ──────────────────────────────
    // MonitorService and TransmitService are created lazily after a hardware
    // adapter is connected.  The handler starts with null services and they
    // are injected once the bus connection is established.
    const messageHandler = new WebviewMessageHandler(databaseService, null, null, eventBus);
    messageHandler.setConnectBusCommand(commandRegistrar.connectCommand);
    messageHandler.setVirtualBusSimulationService(virtualBusSimulationService);

    const signalLabBar = new SignalLabStatusBar(() => {
        const { monitorRunning, periodicIntervals } = messageHandler.getSignalLabBusState();
        return monitorRunning || Object.keys(periodicIntervals).length > 0;
    }, context);

    // const { treeView: signalLabTreeView, provider: signalLabTreeProvider } =
    //     SignalLabSidebarTreeProvider.register(databaseService);
    // context.subscriptions.push(signalLabTreeView);

    const refreshSignalLabHostUi = (): void => {
        signalLabBar.refresh();
    };
    messageHandler.setSignalLabActivityRefresh(refreshSignalLabHostUi);
    context.subscriptions.push({
        dispose: eventBus.on('bus:stateChanged', refreshSignalLabHostUi),
    });
    refreshSignalLabHostUi();

    // ── Bus connectivity: deferred service wiring ───────────────────────────
    // When the ConnectBusCommand establishes an adapter, wire up the bus
    // application services and push them to the command registrar and webview.
    const connectCommand = commandRegistrar.connectCommand;

    connectCommand.onAdapterConnected((adapter) => {
        Logger.info('Bus adapter connected — creating MonitorService and TransmitService');

        if (adapter instanceof VirtualCanAdapter) {
            virtualBusSimulationService.setSimulationAdapter(adapter);
        } else {
            virtualBusSimulationService.setSimulationAdapter(null);
        }

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
        /** Decode and forward frames to Signal Lab whenever the bus is connected (transmit echo / inject need this). */
        monitorService.start();
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
        virtualBusSimulationService.setSimulationAdapter(null);
        virtualBusSimulationService.resetSession();
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
    const refreshSidebarTrees = (): void => {
        treeProvider.refresh();
        // signalLabTreeProvider.refresh();
    };
    context.subscriptions.push({
        dispose: eventBus.on('database:loaded', refreshSidebarTrees),
    });
    context.subscriptions.push({
        dispose: eventBus.on('database:changed', refreshSidebarTrees),
    });
    context.subscriptions.push({
        dispose: eventBus.on('bus:activeDatabaseUriChanged', refreshSidebarTrees),
    });

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

/**
 * Called when the extension is deactivated; currently logs only (subscriptions dispose with the context).
 */
export function deactivate(): void {
    Logger.info('candb-studio extension deactivated');
}
