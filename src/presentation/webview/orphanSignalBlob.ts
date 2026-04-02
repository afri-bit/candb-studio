import { CanDatabase } from '../../core/models/database/CanDatabase';
import { Signal } from '../../core/models/database/Signal';
import { serializeSignalForWebview, type SerializedSignal } from './serializeDatabaseForWebview';
import { webviewSignalToSignal, type WebviewSignalInput } from './webviewDescriptorsToDomain';

const emptyDbForOrphanEncode = new CanDatabase();

/** Marker line in .dbc (comment) before base64 payload. */
export const ORPHAN_SIGNALS_MARKER = '// VSCODE_CANBUS_ORPHAN_SIGNALS_V1';

export function encodeOrphanSignals(signals: Signal[]): string {
    const payload: SerializedSignal[] = signals.map((s) =>
        serializeSignalForWebview(s, emptyDbForOrphanEncode),
    );
    const json = JSON.stringify({ v: 1, signals: payload });
    return Buffer.from(json, 'utf8').toString('base64');
}

export function decodeOrphanSignals(b64: string): Signal[] {
    const json = Buffer.from(b64.trim(), 'base64').toString('utf8');
    const data = JSON.parse(json) as { v: number; signals: SerializedSignal[] };
    if (!data.signals || !Array.isArray(data.signals)) {
        return [];
    }
    return data.signals.map((s) => webviewSignalToSignal(s as unknown as WebviewSignalInput));
}

/** Parse trailing orphan block from full DBC text; returns [] if missing or invalid. */
export function parseOrphanSignalsFromDbcContent(content: string): Signal[] {
    const idx = content.indexOf(ORPHAN_SIGNALS_MARKER);
    if (idx === -1) {
        return [];
    }
    const after = content.slice(idx + ORPHAN_SIGNALS_MARKER.length);
    const line = after
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0);
    if (!line) {
        return [];
    }
    const b64 = line.startsWith('//') ? line.replace(/^\/\/\s*/, '').trim() : line;
    if (!b64) {
        return [];
    }
    try {
        return decodeOrphanSignals(b64);
    } catch {
        return [];
    }
}
