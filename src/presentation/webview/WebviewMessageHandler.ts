import * as vscode from 'vscode';
import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from './messages/WebviewMessageTypes';
import type { CanDatabaseService } from '../../application/services/CanDatabaseService';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import type { MonitorService } from '../../application/services/MonitorService';
import type { TransmitService } from '../../application/services/TransmitService';
import type { EventBus } from '../../shared/events/EventBus';
import { Message } from '../../core/models/database/Message';
import { Node } from '../../core/models/database/Node';
import { CanFrame } from '../../core/models/bus/CanFrame';
import { CanBusState } from '../../core/enums/CanBusState';
import { DecodedMessage } from '../../core/models/bus/DecodedMessage';
import { TransmitTask } from '../../core/models/bus/TransmitTask';
import { Logger } from '../../shared/utils/Logger';
import { Commands } from '../../shared/constants';
import { serializeDatabaseForWebview } from './serializeDatabaseForWebview';
import type { WebviewSignalInput } from './webviewDescriptorsToDomain';
import { DocumentTextSync } from '../editors/DocumentTextSync';

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

  /** Bus + activity snapshot for host UI (status bar, sidebar webview). */
  getSignalLabHostSnapshot(): {
    busState: CanBusState;
    monitorRunning: boolean;
    periodicIntervals: Record<number, number>;
  } {
    const bus = this.getSignalLabBusState();
    return {
      busState: this.lastBusState,
      monitorRunning: bus.monitorRunning,
      periodicIntervals: bus.periodicIntervals,
    };
  }

  /** Whether monitor is running and periodic task intervals (CAN id → ms). */
  getSignalLabBusState(): { monitorRunning: boolean; periodicIntervals: Record<number, number> } {
    const monitorRunning = this.monitorService?.isRunning ?? false;
    const periodicIntervals: Record<number, number> = {};
    for (const t of this.transmitService?.activeTasks ?? []) {
      const m = /^periodic-(\d+)$/.exec(t.id);
      if (m) {
        periodicIntervals[Number(m[1])] = t.intervalMs;
      }
    }
    return { monitorRunning, periodicIntervals };
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
      const signal = decoded.message.findSignalByName(signalName, decoded.signalPool, decoded.database);
      signals.push({
        signalName,
        rawValue: physicalValue,
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
        },
        messageName: decoded.message.name,
        signals,
        direction,
      },
    };
  }

  private buildMonitorFrameFromRaw(frame: CanFrame, direction: 'tx' | 'rx'): ExtensionToWebviewMessage {
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
        } catch (e) {
          Logger.error('signalLab.setActiveDatabaseUri failed', e);
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
        const frame = new CanFrame({
          id: message.messageId,
          data: new Uint8Array(data),
          dlc: data.length,
          timestamp: Date.now(),
        });
        await this.transmitService?.sendOnce(frame);
        break;
      }

      case 'transmit.startPeriodic': {
        const p = message;
        const taskId = `periodic-${p.messageId}`;
        const frame = new CanFrame({
          id: p.messageId,
          data: new Uint8Array(p.data),
          dlc: p.data.length,
          timestamp: Date.now(),
        });
        const task = new TransmitTask({
          id: taskId,
          frame,
          isPeriodic: true,
          intervalMs: p.intervalMs,
        });
        this.transmitService?.startPeriodic(task);
        this.afterSignalLabBusMutation();
        break;
      }

      case 'transmit.stopPeriodic': {
        const taskId = `periodic-${message.messageId}`;
        this.transmitService?.stopPeriodic(taskId);
        this.afterSignalLabBusMutation();
        break;
      }

      case 'transmit.updatePeriodicPayload': {
        this.transmitService?.updatePeriodicPayload(message.messageId, message.data);
        break;
      }

      case 'transmit.updatePeriodicInterval': {
        this.transmitService?.updatePeriodicInterval(message.messageId, message.intervalMs);
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
        const frame = new CanFrame({
          id: message.payload.id,
          data: new Uint8Array(message.payload.data),
          dlc: message.payload.dlc,
          timestamp: Date.now(),
        });
        await this.transmitService?.sendOnce(frame);
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

      default:
        Logger.warn(`Unhandled Signal Lab message: ${(message as { type: string }).type}`);
    }
  }

  private async handleMessage(message: WebviewToExtensionMessage, documentUri: string): Promise<void> {
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
        } catch (e) {
          Logger.error('openTextEditorView failed', e);
        }
        break;

      case 'updateMessage': {
        const { documentUri: u, messageId, changes } = message.payload;
        try {
          this.databaseService.updateMessage(u, messageId, changes);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('updateMessage failed', e);
        }
        break;
      }

      case 'updateSignal': {
        const { documentUri: u, messageId, signalName, changes } = message.payload;
        try {
          this.databaseService.updateSignal(u, messageId, signalName, changes);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('updateSignal failed', e);
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
        } catch (e) {
          Logger.error('linkSignalToMessage failed', e);
        }
        break;
      }

      case 'addPoolSignal': {
        const { documentUri: u, signal } = message.payload;
        try {
          this.databaseService.addPoolSignal(u, signal as unknown as WebviewSignalInput);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('addPoolSignal failed', e);
        }
        break;
      }

      case 'removePoolSignal': {
        const { documentUri: u, signalName } = message.payload;
        try {
          this.databaseService.removePoolSignal(u, signalName);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('removePoolSignal failed', e);
        }
        break;
      }

      case 'updatePoolSignal': {
        const { documentUri: u, signalName, changes } = message.payload;
        try {
          this.databaseService.updatePoolSignal(u, signalName, changes);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('updatePoolSignal failed', e);
        }
        break;
      }

      case 'removeSignal': {
        const { documentUri: u, messageId, signalName } = message.payload;
        try {
          this.databaseService.removeSignal(u, messageId, signalName);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('removeSignal failed', e);
        }
        break;
      }

      case 'updateNode': {
        const { documentUri: u, nodeName, changes } = message.payload;
        try {
          this.databaseService.updateNode(u, nodeName, changes);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('updateNode failed', e);
        }
        break;
      }

      case 'updateAttribute': {
        const { documentUri: u, index, changes } = message.payload;
        try {
          this.databaseService.updateAttributeDefinition(u, index, changes);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('updateAttribute failed', e);
        }
        break;
      }

      case 'addAttributeDefinition': {
        const { documentUri: u } = message.payload;
        try {
          this.databaseService.addAttributeDefinition(u);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('addAttributeDefinition failed', e);
        }
        break;
      }

      case 'removeAttributeDefinition': {
        const { documentUri: u, index } = message.payload;
        try {
          this.databaseService.removeAttributeDefinition(u, index);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('removeAttributeDefinition failed', e);
        }
        break;
      }

      case 'addValueTable': {
        const { documentUri: u, name, comment, entries } = message.payload;
        try {
          this.databaseService.addValueTable(u, name, { comment, entries });
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('addValueTable failed', e);
        }
        break;
      }

      case 'updateValueTable': {
        const { documentUri: u, name, changes } = message.payload;
        try {
          this.databaseService.updateValueTable(u, name, changes);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('updateValueTable failed', e);
        }
        break;
      }

      case 'removeValueTable': {
        const { documentUri: u, name } = message.payload;
        try {
          this.databaseService.removeValueTable(u, name);
          await this.persistEditorDocument(u);
        } catch (e) {
          Logger.error('removeValueTable failed', e);
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
            }),
            message.payload.documentUri,
          );
          await this.persistEditorDocument(message.payload.documentUri);
        } catch (e) {
          Logger.error('addMessage failed', e);
        }
        break;

      case 'removeMessage':
        try {
          this.databaseService.removeMessage(message.payload.messageId, message.payload.documentUri);
          await this.persistEditorDocument(message.payload.documentUri);
        } catch (e) {
          Logger.error('removeMessage failed', e);
        }
        break;

      case 'addNode':
        try {
          this.databaseService.addNode(new Node(message.payload.name), message.payload.documentUri);
          await this.persistEditorDocument(message.payload.documentUri);
        } catch (e) {
          Logger.error('addNode failed', e);
        }
        break;

      case 'removeNode':
        try {
          this.databaseService.removeNode(message.payload.name, message.payload.documentUri);
          await this.persistEditorDocument(message.payload.documentUri);
        } catch (e) {
          Logger.error('removeNode failed', e);
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
    });
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
      });
    });

    this.eventBus.on('bus:frameReceived', (payload) => {
      this.postToSignalLab(this.buildMonitorFrameFromRaw(payload.frame, payload.direction));
    });

    this.eventBus.on('bus:messageDecoded', (payload) => {
      this.postToSignalLab(this.buildMonitorFrameFromDecoded(payload.decoded, payload.direction));
    });
  }
}
