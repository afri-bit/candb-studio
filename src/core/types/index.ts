/** CAN message ID (11-bit standard or 29-bit extended). */
export type CanId = number;

/** Raw byte data as a Uint8Array. */
export type CanData = Uint8Array;

/** Bitrate in bits per second. */
export type Bitrate = number;

/** Generic disposable resource handle (mirrors VS Code's Disposable). */
export interface Disposable {
    dispose(): void;
}

/** Severity level for validation diagnostics. */
export enum DiagnosticSeverity {
    Error = 'error',
    Warning = 'warning',
    Info = 'info',
}

/** A single diagnostic produced by database validation. */
export interface DiagnosticItem {
    severity: DiagnosticSeverity;
    message: string;
    /**
     * Dot-separated path identifying the problematic object,
     * e.g. `"messages[0].signals[2].startBit"`.
     */
    path?: string;
}
