/**
 * Typed message protocol between the extension host and the Svelte webview.
 * Both sides share these types to guarantee type-safe message passing.
 */

/** Messages sent FROM the webview TO the extension host. */
export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'database.ready' }
  | { type: 'requestDatabase' }
  | { type: 'saveDocument'; documentUri: string }
  /** Open the same document with the built-in text editor (leave the visual editor). */
  | { type: 'openTextEditorView'; documentUri: string }
  | { type: 'monitor.start' }
  | { type: 'monitor.stop' }
  | { type: 'transmit.send'; messageId: number; data: number[] }
  | { type: 'transmit.startPeriodic'; messageId: number; data: number[]; intervalMs: number }
  | { type: 'transmit.stopPeriodic'; messageId: number }
  /** Signal Lab: update payload of a running periodic task without restarting the timer. */
  | { type: 'transmit.updatePeriodicPayload'; messageId: number; data: number[] }
  /** Signal Lab: change repeat interval of a running periodic task without stop/start. */
  | { type: 'transmit.updatePeriodicInterval'; messageId: number; intervalMs: number }
  | {
      type: 'updateMessage';
      payload: { documentUri: string; messageId: number; changes: Record<string, unknown> };
    }
  | {
      type: 'updateSignal';
      payload: { documentUri: string; messageId: number; signalName: string; changes: Record<string, unknown> };
    }
  | {
      type: 'linkSignalToMessage';
      payload: { documentUri: string; messageId: number; signalName: string; startBit?: number };
    }
  | { type: 'addPoolSignal'; payload: { documentUri: string; signal: Record<string, unknown> } }
  | { type: 'removePoolSignal'; payload: { documentUri: string; signalName: string } }
  | {
      type: 'updatePoolSignal';
      payload: { documentUri: string; signalName: string; changes: Record<string, unknown> };
    }
  | { type: 'removeSignal'; payload: { documentUri: string; messageId: number; signalName: string } }
  | { type: 'addMessage'; payload: { documentUri: string; name: string; id: number; dlc: number } }
  | { type: 'removeMessage'; payload: { documentUri: string; messageId: number } }
  | { type: 'updateNode'; payload: { documentUri: string; nodeName: string; changes: Record<string, unknown> } }
  | { type: 'addNode'; payload: { documentUri: string; name: string } }
  | { type: 'removeNode'; payload: { documentUri: string; name: string } }
  | {
      type: 'updateAttribute';
      payload: { documentUri: string; index: number; changes: Record<string, unknown> };
    }
  | { type: 'addAttributeDefinition'; payload: { documentUri: string } }
  | { type: 'removeAttributeDefinition'; payload: { documentUri: string; index: number } }
  | {
      type: 'addValueTable';
      payload: {
        documentUri: string;
        name: string;
        comment?: string;
        /** Raw value → label (JSON keys are stringified numbers). */
        entries?: Record<number, string>;
      };
    }
  | {
      type: 'updateValueTable';
      payload: { documentUri: string; name: string; changes: Record<string, unknown> };
    }
  | { type: 'removeValueTable'; payload: { documentUri: string; name: string } }
  | { type: 'startMonitor' }
  | { type: 'stopMonitor' }
  | { type: 'sendFrame'; payload: { id: number; data: number[]; dlc: number } }
  | { type: 'startPeriodicTransmit'; payload: { taskId: string; id: number; data: number[]; dlc: number; intervalMs: number } }
  | { type: 'stopPeriodicTransmit'; payload: { taskId: string } }
  /** Signal Lab: set which loaded session decodes the bus. */
  | { type: 'signalLab.setActiveDatabaseUri'; uri: string | null }
  /** Signal Lab: open a DBC via the extension command (Quick Open / file dialog). */
  | { type: 'signalLab.openDatabase' };

/** Messages sent FROM the extension host TO the webview. */
export type ExtensionToWebviewMessage =
  | { type: 'database.update'; database: unknown; documentUri: string }
  | { type: 'databaseLoaded'; payload: { database: unknown } }
  | { type: 'databaseChanged'; payload: { database: unknown } }
  | { type: 'update'; payload: { content: string } }
  | { type: 'frameReceived'; payload: { id: number; data: number[]; dlc: number; timestamp: number } }
  | { type: 'decodedMessage'; payload: { messageName: string; signals: Array<{ name: string; value: number; unit: string }> } }
  | { type: 'busStateChanged'; payload: { state: string } }
  | { type: 'error'; payload: { message: string } }
  /** Normalized monitor row for Signal Lab (matches webview `monitor.frame` shape). */
  | {
      type: 'monitor.frame';
      frame: {
        frame: {
          id: number;
          data: number[];
          dlc: number;
          timestamp: number;
          isExtended: boolean;
        };
        messageName: string;
        signals: Array<{
          signalName: string;
          rawValue: number;
          physicalValue: number;
          unit: string;
        }>;
        /** Loopback echo of our transmit vs bus receive. */
        direction: 'tx' | 'rx';
      };
    }
  /** VS Code–style connection update (Signal Lab). */
  | { type: 'connection.stateChanged'; state: string; adapterType?: string }
  /** Loaded DBC sessions and which one is active for decode. */
  | {
      type: 'signalLab.context';
      sessions: string[];
      activeUri: string | null;
      /** Extension-side monitor state (webview syncs on open). */
      monitorRunning: boolean;
      /** CAN id → interval ms for active periodic transmit tasks. */
      periodicIntervals: Record<number, number>;
    };
