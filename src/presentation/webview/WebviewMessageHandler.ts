import * as vscode from 'vscode';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import type { MonitorService } from '../../application/services/MonitorService';
import type { TransmitService } from '../../application/services/TransmitService';
import {
    validateCanFdRawFrame,
    validateCanRawFrame,
} from '../../application/services/canRawFrameValidation';
import type { VirtualBusSimulationService } from '../../application/services/VirtualBusSimulationService';
import { AdapterType } from '../../core/enums/AdapterType';
import { CanBusState } from '../../core/enums/CanBusState';
import { CanFrame } from '../../core/models/bus/CanFrame';
import { CanChannel } from '../../core/models/bus/CanChannel';
import { DecodedMessage } from '../../core/models/bus/DecodedMessage';
import { TransmitTask } from '../../core/models/bus/TransmitTask';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import { Message } from '../../core/models/database/Message';
import { Node } from '../../core/models/database/Node';
import { SocketCanAdapter } from '../../infrastructure/adapters/SocketCanAdapter';
import { VirtualCanAdapter } from '../../infrastructure/adapters/VirtualCanAdapter';
import type { ConnectBusCommand } from '../commands/ConnectBusCommand';
import { Commands, DEFAULT_BITRATE } from '../../shared/constants';
import type { EventBus } from '../../shared/events/EventBus';
import { Logger } from '../../shared/utils/Logger';
import { messageForUser } from '../../shared/utils/errorUtils';
import { DocumentTextSync } from '../editors/DocumentTextSync';
import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from './messages/WebviewMessageTypes';
import { serializeDatabaseForWebview } from './serializeDatabaseForWebview';
import type { WebviewSignalInput } from './webviewDescriptorsToDomain';

type EditorContext = {
    panel: vscode.WebviewPanel;
    document: vscode.TextDocument;
    sync: DocumentTextSync;
};

/**
 * Routes messages between the extension host and the Svelte webview.
 * Handles incoming webview requests and forwards internal events back to the webview.
 */
export class WebviewMessageHandler {
    private readonly editorContexts = new Map<string, EditorContext>();
    private monitorService: MonitorService | null;
    private transmitService: TransmitService | null;
    private connectBusCommand: ConnectBusCommand | null = null;
    private virtualBusSimulationService: VirtualBusSimulationService | null = null;
    /** True when Signal Lab started an in-process virtual adapter (stop should disconnect). */
    private virtualSimAutoConnected = false;
    /** Singleton Signal Lab panel — bus traffic is posted only here. */
    private signalLabPanel: vscode.WebviewPanel | null = null;
    /** Last emitted bus state so Signal Lab can sync if opened after connect. */
    private lastBusState: CanBusState = CanBusState.Disconnected;
    /** Extension host: refresh status bar when monitor/transmit activity changes. */
    private signalLabActivityRefresh: (() => void) | undefined;

    constructor(
        private readonly databaseService: CanDatabaseService,
        monitorService: MonitorService | null,
        transmitService: TransmitService | null,
        private readonly eventBus: EventBus,
    ) {
        this.monitorService = monitorService;
        this.transmitService = transmitService;
        this.subscribeToEvents();
    }

    /** Host UI (status bar) hooks when monitor or periodic transmit state changes. */
    setSignalLabActivityRefresh(cb: (() => void) | undefined): void {
        this.signalLabActivityRefresh = cb;
    }

    private notifySignalLabActivityChanged(): void {
        this.signalLabActivityRefresh?.();
    }

    /** Push Signal Lab context (monitor + periodic sync) and refresh host status bar. */
    private afterSignalLabBusMutation(): void {
        this.pushSignalLabState();
        this.notifySignalLabActivityChanged();
    }

    /** Whether monitor is running and periodic task intervals (CAN id → ms). */
    getSignalLabBusState(): {
        monitorRunning: boolean;
        periodicIntervals: Record<number, number>;
        connectionMode: 'disconnected' | 'virtual_simulation' | 'hardware';
        virtualSimulationRunning: boolean;
    } {
        const connectionMode = this.getConnectionMode();
        const monitorRunning = this.monitorService?.isRunning ?? false;
        const virtualSimulationRunning = this.virtualBusSimulationService?.isRunning() ?? false;
        const periodicIntervals: Record<number, number> = {};
        if (connectionMode === 'virtual_simulation' && this.virtualBusSimulationService) {
            Object.assign(
                periodicIntervals,
                this.virtualBusSimulationService.getPeriodicIntervals(),
            );
        } else {
            for (const t of this.transmitService?.activeTasks ?? []) {
                const m = /^periodic-(\d+)$/.exec(t.id);
                if (m) {
                    periodicIntervals[Number(m[1])] = t.intervalMs;
                }
            }
        }
        return { monitorRunning, periodicIntervals, connectionMode, virtualSimulationRunning };
    }

    /** Stop monitor and all periodic transmit (used when closing Signal Lab with “stop”). */
    stopSignalLabBusActivity(): void {
        this.monitorService?.stop();
        this.transmitService?.stopAll();
        this.notifySignalLabActivityChanged();
    }

    /** Update the monitor service after a hardware connection is established. */
    setMonitorService(service: MonitorService | null): void {
        this.monitorService = service;
    }

    /** Update the transmit service after a hardware connection is established. */
    setTransmitService(service: TransmitService | null): void {
        this.transmitService = service;
    }

    setConnectBusCommand(cmd: ConnectBusCommand | null): void {
        this.connectBusCommand = cmd;
    }

    setVirtualBusSimulationService(service: VirtualBusSimulationService | null): void {
        this.virtualBusSimulationService = service;
    }

    private getConnectionMode(): 'disconnected' | 'virtual_simulation' | 'hardware' {
        const a = this.connectBusCommand?.getAdapter() ?? null;
        if (!a) {
            return 'disconnected';
        }
        if (a instanceof VirtualCanAdapter) {
            return 'virtual_simulation';
        }
        return 'hardware';
    }

    private resolveAdapterTypeLabel(): string | undefined {
        const a = this.connectBusCommand?.getAdapter();
        if (!a) {
            return undefined;
        }
        if (a instanceof VirtualCanAdapter) {
            return AdapterType.Virtual;
        }
        if (a instanceof SocketCanAdapter) {
            return AdapterType.SocketCAN;
        }
        return undefined;
    }

    private postSignalLabError(message: string, code?: string): void {
        this.postToSignalLab({ type: 'signalLab.error', message, code });
    }

    private async handleTransmitRaw(
        id: number,
        data: Uint8Array,
        dlc: number,
        isExtended: boolean,
        isFd = false,
        isBrs = false,
    ): Promise<void> {
        const v = isFd
            ? validateCanFdRawFrame(id, data, dlc, isExtended, isBrs)
            : validateCanRawFrame(id, data, dlc, isExtended);
        if (!v.ok) {
            this.postSignalLabError(v.message, v.code);
            return;
        }
        const adapter = this.connectBusCommand?.getAdapter();
        if (!adapter) {
            this.postSignalLabError(
                'Connect hardware or start virtual simulation first.',
                'NOT_CONNECTED',
            );
            return;
        }
        const frame = new CanFrame({
            id,
            data: new Uint8Array(data),
            dlc,
            isExtended,
            timestamp: Date.now(),
            isFd,
            isBrs,
        });
        try {
            if (adapter instanceof VirtualCanAdapter) {
                /** Same fingerprint path as {@link TransmitService} loopback → monitor Tx column. */
                this.eventBus.emit('bus:frameTransmitted', frame);
                adapter.injectFrameForMonitor(frame);
            } else {
                if (!this.transmitService) {
                    this.postSignalLabError('Transmit service is not ready.', 'NO_TRANSMIT');
                    return;
                }
                await this.transmitService.sendOnce(frame);
            }
        } catch (e: unknown) {
            this.postSignalLabError(messageForUser(e));
        }
    }

    /**
     * Attach the singleton Signal Lab webview (monitor / transmit / active DB).
     */
    attachSignalLab(panel: vscode.WebviewPanel): vscode.Disposable {
        this.signalLabPanel = panel;
        const sub = panel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
            void this.handleSignalLabMessage(message);
        });
        const disposePanel = panel.onDidDispose(() => {
            if (this.signalLabPanel === panel) {
                this.signalLabPanel = null;
            }
        });
        this.pushSignalLabState();
        this.notifySignalLabActivityChanged();
        return new vscode.Disposable(() => {
            sub.dispose();
            disposePanel.dispose();
            if (this.signalLabPanel === panel) {
                this.signalLabPanel = null;
            }
            this.notifySignalLabActivityChanged();
        });
    }

    /**
     * Attach message routing for a custom editor panel and its backing document.
     */
    attach(panel: vscode.WebviewPanel, document: vscode.TextDocument): vscode.Disposable {
        const uri = document.uri.toString();
        const sync = new DocumentTextSync();
        this.editorContexts.set(uri, { panel, document, sync });
        const sub = panel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
            void this.handleMessage(message, uri);
        });
        return new vscode.Disposable(() => {
            sub.dispose();
            this.editorContexts.delete(uri);
        });
    }

    /** True while a workspace edit from this extension is updating the document (skip re-parse). */
    isDocumentSyncApplying(uri: string): boolean {
        return this.editorContexts.get(uri)?.sync.isApplying() ?? false;
    }

    /** Push an empty database state after a parse failure. */
    sendEmptyDatabase(uri: string): void {
        const ctx = this.editorContexts.get(uri);
        if (!ctx) {
            return;
        }
        const empty = {
            version: '',
            nodes: [],
            messages: [],
            signalPool: [],
            attributes: [],
            environmentVariables: [],
            valueTables: [],
        };
        ctx.panel.webview.postMessage({
            type: 'database.update',
            database: empty,
            documentUri: uri,
            settings: this.getWebviewSettings(),
        });
    }

    private postToSignalLab(message: ExtensionToWebviewMessage): void {
        const w = this.signalLabPanel?.webview;
        if (!w) {
            return;
        }
        void w.postMessage(message);
    }

    private buildMonitorFrameFromDecoded(
        decoded: DecodedMessage,
        direction: 'tx' | 'rx',
    ): ExtensionToWebviewMessage {
        const signals: Array<{
            signalName: string;
            rawValue: number;
            physicalValue: number;
            unit: string;
        }> = [];
        decoded.signalValues.forEach((physicalValue, signalName) => {
            const signal = decoded.message.findSignalByName(
                signalName,
                decoded.signalPool,
                decoded.database,
            );
            const rawValue =
                signal && signal.factor !== 0
                    ? Math.round(signal.physicalToRaw(physicalValue))
                    : Math.round(physicalValue);
            signals.push({
                signalName,
                rawValue,
                physicalValue,
                unit: signal?.unit ?? '',
            });
        });
        const f = decoded.frame;
        return {
            type: 'monitor.frame',
            frame: {
                frame: {
                    id: f.id,
                    data: Array.from(f.data),
                    dlc: f.dlc,
                    /** Host receive instant (ms), not the raw frame field (periodic transmit reuses one CanFrame). */
                    timestamp: decoded.timestamp,
                    isExtended: f.isExtended,
                    isFd: f.isFd,
                    brs: f.isBrs,
                    esi: f.isEsi,
                },
                messageName: decoded.message.name,
                signals,
                direction,
            },
        };
    }

    private buildMonitorFrameFromRaw(
        frame: CanFrame,
        direction: 'tx' | 'rx',
    ): ExtensionToWebviewMessage {
        const receiveTime = Date.now();
        return {
            type: 'monitor.frame',
            frame: {
                frame: {
                    id: frame.id,
                    data: Array.from(frame.data),
                    dlc: frame.dlc,
                    timestamp: receiveTime,
                    isExtended: frame.isExtended,
                    isFd: frame.isFd,
                    brs: frame.isBrs,
                    esi: frame.isEsi,
                },
                messageName: '(unknown)',
                signals: [],
                direction,
            },
        };
    }

    /** Push session list, active URI, and serialized DB for Signal Lab. */
    pushSignalLabState(): void {
        const w = this.signalLabPanel?.webview;
        if (!w) {
            return;
        }
        void w.postMessage({
            type: 'connection.stateChanged',
            state: String(this.lastBusState),
            adapterType: this.resolveAdapterTypeLabel(),
        } satisfies ExtensionToWebviewMessage);

        const sessions = this.databaseService.getSessionUris();
        const activeUri = this.databaseService.getActiveBusDatabaseUri();
        const bus = this.getSignalLabBusState();
        void w.postMessage({
            type: 'signalLab.context',
            sessions,
            activeUri,
            monitorRunning: bus.monitorRunning,
            periodicIntervals: bus.periodicIntervals,
            connectionMode: bus.connectionMode,
            virtualSimulationRunning: bus.virtualSimulationRunning,
        } satisfies ExtensionToWebviewMessage);

        const empty = {
            version: '',
            nodes: [],
            messages: [],
            signalPool: [],
            attributes: [],
            environmentVariables: [],
            valueTables: [],
        };
        const key = activeUri ?? '';
        const db = activeUri ? this.databaseService.getDatabase(activeUri) : null;
        void w.postMessage({
            type: 'database.update',
            database: db ? serializeDatabaseForWebview(db) : empty,
            documentUri: key,
            settings: this.getWebviewSettings(),
        } satisfies ExtensionToWebviewMessage);
    }

    private async handleSignalLabMessage(message: WebviewToExtensionMessage): Promise<void> {
        Logger.info(`Signal Lab webview message: ${message.type}`);

        switch (message.type) {
            case 'ready':
            case 'database.ready':
            case 'requestDatabase':
                this.pushSignalLabState();
                break;

            case 'signalLab.setActiveDatabaseUri':
                try {
                    this.databaseService.setActiveBusDatabaseUri(message.uri);
                    this.monitorService?.setDatabase(this.databaseService.getDatabaseForBus());
                } catch (err: unknown) {
                    Logger.error('signalLab.setActiveDatabaseUri failed', err);
                }
                this.pushSignalLabState();
                break;

            case 'signalLab.openDatabase':
                await vscode.commands.executeCommand(Commands.OPEN_DATABASE);
                break;

            case 'monitor.start':
                this.monitorService?.start();
                this.afterSignalLabBusMutation();
                break;

            case 'monitor.stop':
                this.monitorService?.stop();
                this.afterSignalLabBusMutation();
                break;

            case 'transmit.send': {
                const data = message.data;
                const busDb = this.databaseService.getDatabaseForBus();
                const msgDef = busDb?.findMessageById(message.messageId);
                const frame = new CanFrame({
                    id: message.messageId,
                    data: new Uint8Array(data),
                    dlc: data.length,
                    timestamp: Date.now(),
                    isFd: msgDef?.isFd ?? false,
                });
                await this.transmitService?.sendOnce(frame);
                break;
            }

            case 'transmit.sendRaw': {
                const m = message;
                await this.handleTransmitRaw(
                    m.id,
                    new Uint8Array(m.data),
                    m.dlc,
                    m.isExtended ?? false,
                    m.isFd ?? false,
                    m.isBrs ?? false,
                );
                break;
            }

            case 'transmit.startPeriodic': {
                const p = message;
                if (
                    this.getConnectionMode() === 'virtual_simulation' &&
                    this.virtualBusSimulationService
                ) {
                    const r = this.virtualBusSimulationService.startPeriodic(
                        p.messageId,
                        new Uint8Array(p.data),
                        p.intervalMs,
                    );
                    if (!r.ok) {
                        this.postSignalLabError(r.message, r.code);
                    }
                } else {
                    const taskId = `periodic-${p.messageId}`;
                    const periodicBusDb = this.databaseService.getDatabaseForBus();
                    const periodicMsgDef = periodicBusDb?.findMessageById(p.messageId);
                    const frame = new CanFrame({
                        id: p.messageId,
                        data: new Uint8Array(p.data),
                        dlc: p.data.length,
                        timestamp: Date.now(),
                        isFd: periodicMsgDef?.isFd ?? false,
                    });
                    const task = new TransmitTask({
                        id: taskId,
                        frame,
                        isPeriodic: true,
                        intervalMs: p.intervalMs,
                    });
                    this.transmitService?.startPeriodic(task);
                }
                this.afterSignalLabBusMutation();
                break;
            }

            case 'transmit.stopPeriodic': {
                const taskId = `periodic-${message.messageId}`;
                if (
                    this.getConnectionMode() === 'virtual_simulation' &&
                    this.virtualBusSimulationService
                ) {
                    this.virtualBusSimulationService.stopPeriodic(message.messageId);
                } else {
                    this.transmitService?.stopPeriodic(taskId);
                }
                this.afterSignalLabBusMutation();
                break;
            }

            case 'transmit.updatePeriodicPayload': {
                if (
                    this.getConnectionMode() === 'virtual_simulation' &&
                    this.virtualBusSimulationService
                ) {
                    this.virtualBusSimulationService.updatePeriodicPayload(
                        message.messageId,
                        message.data,
                    );
                } else {
                    this.transmitService?.updatePeriodicPayload(message.messageId, message.data);
                }
                break;
            }

            case 'transmit.updatePeriodicInterval': {
                if (
                    this.getConnectionMode() === 'virtual_simulation' &&
                    this.virtualBusSimulationService
                ) {
                    this.virtualBusSimulationService.updatePeriodicInterval(
                        message.messageId,
                        message.intervalMs,
                    );
                } else {
                    this.transmitService?.updatePeriodicInterval(
                        message.messageId,
                        message.intervalMs,
                    );
                }
                this.afterSignalLabBusMutation();
                break;
            }

            case 'startMonitor':
                this.monitorService?.start();
                this.afterSignalLabBusMutation();
                break;

            case 'stopMonitor':
                this.monitorService?.stop();
                this.afterSignalLabBusMutation();
                break;

            case 'sendFrame': {
                const p = message.payload;
                await this.handleTransmitRaw(p.id, new Uint8Array(p.data), p.dlc, false);
                break;
            }

            case 'startPeriodicTransmit': {
                const p = message.payload;
                const frame = new CanFrame({
                    id: p.id,
                    data: new Uint8Array(p.data),
                    dlc: p.dlc,
                    timestamp: Date.now(),
                });
                const task = new TransmitTask({
                    id: p.taskId,
                    frame,
                    isPeriodic: true,
                    intervalMs: p.intervalMs,
                });
                this.transmitService?.startPeriodic(task);
                this.afterSignalLabBusMutation();
                break;
            }

            case 'stopPeriodicTransmit':
                this.transmitService?.stopPeriodic(message.payload.taskId);
                this.afterSignalLabBusMutation();
                break;

            case 'virtualBus.start': {
                const cur = this.connectBusCommand?.getAdapter();
                if (cur instanceof SocketCanAdapter && cur.state === CanBusState.Connected) {
                    this.postSignalLabError(
                        'Disconnect hardware (status bar → Disconnect) before starting virtual simulation.',
                        'HARDWARE_ACTIVE',
                    );
                    break;
                }
                const hadAdapter =
                    cur instanceof VirtualCanAdapter && cur.state === CanBusState.Connected;
                try {
                    if (!hadAdapter) {
                        const adapter = new VirtualCanAdapter();
                        const channel = new CanChannel({
                            name: 'signal-lab-virtual',
                            adapterType: AdapterType.Virtual,
                            bitrate: DEFAULT_BITRATE,
                        });
                        await this.connectBusCommand!.connectAdapter(adapter, channel, {
                            silentToast: true,
                        });
                        this.virtualSimAutoConnected = true;
                    } else {
                        this.virtualSimAutoConnected = false;
                    }
                    const startResult = this.virtualBusSimulationService?.start();
                    if (startResult && !startResult.ok) {
                        this.postSignalLabError(startResult.message, startResult.code);
                        if (this.virtualSimAutoConnected) {
                            await this.connectBusCommand?.disconnectSilently();
                            this.virtualSimAutoConnected = false;
                        }
                        break;
                    }
                    this.monitorService?.start();
                } catch (e: unknown) {
                    if (e instanceof Error && e.message === 'CONNECT_CANCELLED') {
                        this.virtualSimAutoConnected = false;
                        break;
                    }
                    this.postSignalLabError(messageForUser(e));
                    if (this.virtualSimAutoConnected) {
                        await this.connectBusCommand?.disconnectSilently().catch(() => undefined);
                        this.virtualSimAutoConnected = false;
                    }
                }
                this.afterSignalLabBusMutation();
                break;
            }

            case 'virtualBus.stop': {
                this.virtualBusSimulationService?.stop();
                this.monitorService?.stop();
                if (this.virtualSimAutoConnected) {
                    await this.connectBusCommand?.disconnectSilently();
                    this.virtualSimAutoConnected = false;
                }
                this.afterSignalLabBusMutation();
                break;
            }

            case 'virtualBus.inject': {
                if (!this.virtualBusSimulationService?.isRunning()) {
                    this.postSignalLabError('Start virtual simulation first.', 'NOT_RUNNING');
                    break;
                }
                const inj = this.virtualBusSimulationService.injectDbcAligned(
                    message.messageId,
                    new Uint8Array(message.data),
                );
                if (!inj.ok) {
                    this.postSignalLabError(inj.message, inj.code);
                }
                break;
            }

            default:
                Logger.warn(`Unhandled Signal Lab message: ${(message as { type: string }).type}`);
        }
    }

    private async handleMessage(
        message: WebviewToExtensionMessage,
        documentUri: string,
    ): Promise<void> {
        Logger.info(`Webview message: ${message.type}`);

        switch (message.type) {
            case 'ready':
            case 'database.ready':
            case 'requestDatabase':
                this.sendDatabaseToWebviewForUri(documentUri);
                break;

            case 'saveDocument': {
                const saveUri = message.documentUri;
                await this.persistEditorDocument(saveUri);
                await vscode.workspace.save(vscode.Uri.parse(saveUri));
                break;
            }

            case 'openTextEditorView':
                try {
                    await vscode.commands.executeCommand(
                        'vscode.openWith',
                        vscode.Uri.parse(message.documentUri),
                        'default',
                    );
                } catch (err: unknown) {
                    Logger.error('openTextEditorView failed', err);
                }
                break;

            case 'updateMessage': {
                const { documentUri: u, messageId, changes } = message.payload;
                try {
                    this.databaseService.updateMessage(u, messageId, changes);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('updateMessage failed', err);
                }
                break;
            }

            case 'updateSignal': {
                const { documentUri: u, messageId, signalName, changes } = message.payload;
                try {
                    this.databaseService.updateSignal(u, messageId, signalName, changes);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('updateSignal failed', err);
                }
                break;
            }

            case 'linkSignalToMessage': {
                const { documentUri: u, messageId, signalName, startBit } = message.payload;
                try {
                    this.databaseService.linkSignalToMessage(u, messageId, signalName, {
                        startBit: typeof startBit === 'number' ? startBit : undefined,
                    });
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('linkSignalToMessage failed', err);
                }
                break;
            }

            case 'addPoolSignal': {
                const { documentUri: u, signal } = message.payload;
                try {
                    this.databaseService.addPoolSignal(u, signal as unknown as WebviewSignalInput);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('addPoolSignal failed', err);
                }
                break;
            }

            case 'removePoolSignal': {
                const { documentUri: u, signalName } = message.payload;
                try {
                    this.databaseService.removePoolSignal(u, signalName);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('removePoolSignal failed', err);
                }
                break;
            }

            case 'updatePoolSignal': {
                const { documentUri: u, signalName, changes } = message.payload;
                try {
                    this.databaseService.updatePoolSignal(u, signalName, changes);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('updatePoolSignal failed', err);
                }
                break;
            }

            case 'removeSignal': {
                const { documentUri: u, messageId, signalName } = message.payload;
                try {
                    this.databaseService.removeSignal(u, messageId, signalName);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('removeSignal failed', err);
                }
                break;
            }

            case 'updateNode': {
                const { documentUri: u, nodeName, changes } = message.payload;
                try {
                    this.databaseService.updateNode(u, nodeName, changes);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('updateNode failed', err);
                }
                break;
            }

            case 'updateAttribute': {
                const { documentUri: u, index, changes } = message.payload;
                try {
                    this.databaseService.updateAttributeDefinition(u, index, changes);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('updateAttribute failed', err);
                }
                break;
            }

            case 'addAttributeDefinition': {
                const { documentUri: u } = message.payload;
                try {
                    this.databaseService.addAttributeDefinition(u);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('addAttributeDefinition failed', err);
                }
                break;
            }

            case 'removeAttributeDefinition': {
                const { documentUri: u, index } = message.payload;
                try {
                    this.databaseService.removeAttributeDefinition(u, index);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('removeAttributeDefinition failed', err);
                }
                break;
            }

            case 'addValueTable': {
                const { documentUri: u, name, comment, entries } = message.payload;
                try {
                    this.databaseService.addValueTable(u, name, { comment, entries });
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('addValueTable failed', err);
                }
                break;
            }

            case 'updateValueTable': {
                const { documentUri: u, name, changes } = message.payload;
                try {
                    this.databaseService.updateValueTable(u, name, changes);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('updateValueTable failed', err);
                }
                break;
            }

            case 'removeValueTable': {
                const { documentUri: u, name } = message.payload;
                try {
                    this.databaseService.removeValueTable(u, name);
                    await this.persistEditorDocument(u);
                } catch (err: unknown) {
                    Logger.error('removeValueTable failed', err);
                }
                break;
            }

            case 'addMessage':
                try {
                    this.databaseService.addMessage(
                        new Message({
                            id: message.payload.id,
                            name: message.payload.name,
                            dlc: message.payload.dlc,
                            isFd: message.payload.isFd ?? false,
                        }),
                        message.payload.documentUri,
                    );
                    await this.persistEditorDocument(message.payload.documentUri);
                } catch (err: unknown) {
                    Logger.error('addMessage failed', err);
                }
                break;

            case 'removeMessage':
                try {
                    this.databaseService.removeMessage(
                        message.payload.messageId,
                        message.payload.documentUri,
                    );
                    await this.persistEditorDocument(message.payload.documentUri);
                } catch (err: unknown) {
                    Logger.error('removeMessage failed', err);
                }
                break;

            case 'addNode':
                try {
                    this.databaseService.addNode(
                        new Node(message.payload.name),
                        message.payload.documentUri,
                    );
                    await this.persistEditorDocument(message.payload.documentUri);
                } catch (err: unknown) {
                    Logger.error('addNode failed', err);
                }
                break;

            case 'removeNode':
                try {
                    this.databaseService.removeNode(
                        message.payload.name,
                        message.payload.documentUri,
                    );
                    await this.persistEditorDocument(message.payload.documentUri);
                } catch (err: unknown) {
                    Logger.error('removeNode failed', err);
                }
                break;

            default:
                Logger.warn(`Unhandled webview message: ${(message as { type: string }).type}`);
        }
    }

    private async persistEditorDocument(uri: string): Promise<void> {
        const ctx = this.editorContexts.get(uri);
        if (!ctx) {
            return;
        }
        const text = this.databaseService.serializeDocument(uri);
        await ctx.sync.replaceDocumentText(ctx.document, text);
    }

    private sendDatabaseToWebviewForUri(uri: string): void {
        const db = this.databaseService.getDatabase(uri);
        const ctx = this.editorContexts.get(uri);
        if (!ctx) {
            return;
        }
        const serialized = db
            ? serializeDatabaseForWebview(db)
            : {
                  version: '',
                  nodes: [],
                  messages: [],
                  signalPool: [],
                  attributes: [],
                  environmentVariables: [],
                  valueTables: [],
              };
        ctx.panel.webview.postMessage({
            type: 'database.update',
            database: serialized,
            documentUri: uri,
            settings: this.getWebviewSettings(),
        });
    }

    private getWebviewSettings(): { showOverallView: boolean } {
        const cfg = vscode.workspace.getConfiguration('candb-studio');
        return { showOverallView: cfg.get<boolean>('explorer.showOverallView', true) };
    }

    private postDatabaseUpdate(uri: string, database: CanDatabase): void {
        const ctx = this.editorContexts.get(uri);
        if (!ctx) {
            return;
        }
        ctx.panel.webview.postMessage({
            type: 'database.update',
            database: serializeDatabaseForWebview(database),
            documentUri: uri,
            settings: this.getWebviewSettings(),
        });
    }

    private subscribeToEvents(): void {
        this.eventBus.on('database:loaded', (payload) => {
            this.postDatabaseUpdate(payload.uri, payload.database);
            this.pushSignalLabState();
        });

        this.eventBus.on('database:changed', (payload) => {
            this.postDatabaseUpdate(payload.uri, payload.database);
            this.pushSignalLabState();
        });

        this.eventBus.on('bus:activeDatabaseUriChanged', () => {
            this.pushSignalLabState();
        });

        this.eventBus.on('bus:stateChanged', (state) => {
            this.lastBusState = state;
            this.postToSignalLab({
                type: 'connection.stateChanged',
                state: String(state),
                adapterType: this.resolveAdapterTypeLabel(),
            });
        });

        this.eventBus.on('bus:frameReceived', (payload) => {
            this.postToSignalLab(this.buildMonitorFrameFromRaw(payload.frame, payload.direction));
        });

        this.eventBus.on('bus:messageDecoded', (payload) => {
            this.postToSignalLab(
                this.buildMonitorFrameFromDecoded(payload.decoded, payload.direction),
            );
        });
    }
}
