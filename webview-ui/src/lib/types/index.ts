/* ── Domain types shared between webview and extension host ── */

/** Byte order / endianness of a CAN signal. */
export type ByteOrder = 'little_endian' | 'big_endian';

/** CAN signal value type. */
export type SignalValueType = 'integer' | 'float' | 'double';

/** Multiplexing indicator for a signal. */
export type MultiplexIndicator = 'none' | 'multiplexor' | number;

/** CAN bus connection state. */
export type CanBusState = 'disconnected' | 'connecting' | 'connected' | 'error';

/* ── Webview-side domain shapes (plain objects, not classes) ── */

export interface SignalDescriptor {
    name: string;
    startBit: number;
    bitLength: number;
    byteOrder: ByteOrder;
    isSigned: boolean;
    factor: number;
    offset: number;
    minimum: number;
    maximum: number;
    unit: string;
    receivers: string[];
    valueType: SignalValueType;
    multiplex: MultiplexIndicator;
    comment: string;
    valueDescriptions: Record<number, string>;
    /** Optional `VAL_TABLE_` name (pool / resolved). */
    valueTableName?: string;
}

/** DBC `VAL_TABLE_` — named raw value → label map. */
export interface ValueTableDescriptor {
    name: string;
    /** `CM_ VAL_TABLE_` text, if any. */
    comment: string;
    entries: Record<number, string>;
}

export interface MessageDescriptor {
    id: number;
    name: string;
    dlc: number;
    transmitter: string;
    signals: SignalDescriptor[];
    comment: string;
}

export interface NodeDescriptor {
    name: string;
    comment: string;
}

export interface AttributeDescriptor {
    name: string;
    objectType: string;
    valueType: string;
    minimum?: number;
    maximum?: number;
    defaultValue?: string | number;
    values?: string[];
    comment: string;
}

/** Environment variable (EV_) — webview lists names; full editing is via text view. */
export interface EnvironmentVariableDescriptor {
    name: string;
}

export interface CanDatabaseDescriptor {
    version: string;
    nodes: NodeDescriptor[];
    messages: MessageDescriptor[];
    /** Global signal definitions (unique names). */
    signalPool: SignalDescriptor[];
    attributes: AttributeDescriptor[];
    environmentVariables: EnvironmentVariableDescriptor[];
    valueTables: ValueTableDescriptor[];
}

/* ── CAN bus live data types ── */

export interface CanFrameDescriptor {
    id: number;
    data: number[];
    dlc: number;
    timestamp: number;
    isExtended: boolean;
}

export interface DecodedSignalValue {
    signalName: string;
    rawValue: number;
    physicalValue: number;
    unit: string;
}

export interface DecodedFrameDescriptor {
    frame: CanFrameDescriptor;
    messageName: string;
    signals: DecodedSignalValue[];
}

/* ── Webview message protocol ── */

export type WebviewInboundMessage =
    | { type: 'database.update'; database: CanDatabaseDescriptor; documentUri: string }
    | { type: 'monitor.frame'; frame: DecodedFrameDescriptor }
    | { type: 'monitor.clear' }
    | { type: 'connection.stateChanged'; state: CanBusState; adapterType?: string }
    | { type: 'transmit.result'; success: boolean; messageId: number; error?: string };

export type WebviewOutboundMessage =
    | { type: 'database.ready' }
    | { type: 'saveDocument'; documentUri: string }
    | { type: 'database.edit'; database: CanDatabaseDescriptor }
    | { type: 'monitor.start' }
    | { type: 'monitor.stop' }
    | { type: 'connection.connect'; adapterType: string; interfaceName: string }
    | { type: 'connection.disconnect' }
    | { type: 'transmit.send'; messageId: number; data: number[] }
    | { type: 'transmit.startPeriodic'; messageId: number; data: number[]; intervalMs: number }
    | { type: 'transmit.stopPeriodic'; messageId: number };
