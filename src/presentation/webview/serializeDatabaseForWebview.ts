import type { CanDatabase } from '../../core/models/database/CanDatabase';
import type { Message } from '../../core/models/database/Message';
import type { Signal } from '../../core/models/database/Signal';
import type { Node } from '../../core/models/database/Node';
import type { AttributeDefinition } from '../../core/models/database/AttributeDefinition';
import type { EnvironmentVariable } from '../../core/models/database/EnvironmentVariable';
import type { ValueTable } from '../../core/models/database/ValueTable';
import {
  mergeEffectiveValueDescriptionsForPoolOnly,
} from '../../core/models/database/valueDescriptionMerge';
import { ByteOrder } from '../../core/enums/ByteOrder';
import { SignalValueType } from '../../core/enums/SignalValueType';
import { ObjectType } from '../../core/enums/ObjectType';
import { MultiplexIndicator } from '../../core/enums/MultiplexIndicator';

/** Plain shape expected by the Svelte `CanDatabaseDescriptor` / stores. */
export interface SerializedCanDatabase {
  version: string;
  nodes: SerializedNode[];
  messages: SerializedMessage[];
  /** Global signal definitions (unique names). Messages reference these by name. */
  signalPool: SerializedSignal[];
  attributes: SerializedAttribute[];
  /** EV_ entries — names only in the webview (editing via text view). */
  environmentVariables: SerializedEnvironmentVariable[];
  /** `VAL_TABLE_` named enumerations. */
  valueTables: SerializedValueTable[];
}

export interface SerializedValueTable {
  name: string;
  comment: string;
  entries: Record<number, string>;
}

interface SerializedEnvironmentVariable {
  name: string;
}

interface SerializedNode {
  name: string;
  comment: string;
}

interface SerializedMessage {
  id: number;
  name: string;
  dlc: number;
  transmitter: string;
  signals: SerializedSignal[];
  comment: string;
}

export interface SerializedSignal {
  name: string;
  startBit: number;
  bitLength: number;
  byteOrder: 'little_endian' | 'big_endian';
  isSigned: boolean;
  factor: number;
  offset: number;
  minimum: number;
  maximum: number;
  unit: string;
  receivers: string[];
  valueType: 'integer' | 'float' | 'double';
  multiplex: 'none' | 'multiplexor' | number;
  comment: string;
  valueDescriptions: Record<number, string>;
  /** Optional `VAL_TABLE_` name (pool signal). */
  valueTableName: string;
}

interface SerializedAttribute {
  name: string;
  objectType: string;
  valueType: string;
  minimum?: number;
  maximum?: number;
  defaultValue: string | number;
  values?: string[];
  comment: string;
}

function multiplexToWebview(signal: Signal): 'none' | 'multiplexor' | number {
  if (signal.multiplexIndicator === MultiplexIndicator.Multiplexor) {
    return 'multiplexor';
  }
  if (signal.multiplexIndicator === MultiplexIndicator.MultiplexedSignal) {
    return signal.multiplexValue ?? 0;
  }
  return 'none';
}

function byteOrderToWebview(b: ByteOrder): 'little_endian' | 'big_endian' {
  return b === ByteOrder.BigEndian ? 'big_endian' : 'little_endian';
}

function signalValueTypeToWebview(s: Signal): 'integer' | 'float' | 'double' {
  if (s.valueType === SignalValueType.IEEEFloat) {
    return 'float';
  }
  if (s.valueType === SignalValueType.IEEEDouble) {
    return 'double';
  }
  return 'integer';
}

export function serializeSignalForWebview(
  signal: Signal,
  db: CanDatabase,
  options?: { mergedDescriptions?: boolean },
): SerializedSignal {
  const valueDescriptions: Record<number, string> = {};
  const source = options?.mergedDescriptions
    ? signal.valueDescriptions
    : mergeEffectiveValueDescriptionsForPoolOnly(signal, db);
  source.forEach((v, k) => {
    valueDescriptions[k] = v;
  });

  return {
    name: signal.name,
    startBit: signal.startBit,
    bitLength: signal.bitLength,
    byteOrder: byteOrderToWebview(signal.byteOrder),
    isSigned: signal.valueType === SignalValueType.Signed,
    factor: signal.factor,
    offset: signal.offset,
    minimum: signal.minimum,
    maximum: signal.maximum,
    unit: signal.unit,
    receivers: [...signal.receivingNodes],
    valueType: signalValueTypeToWebview(signal),
    multiplex: multiplexToWebview(signal),
    comment: signal.comment ?? '',
    valueDescriptions,
    valueTableName: signal.valueTableName ?? '',
  };
}

function serializeMessage(message: Message, db: CanDatabase): SerializedMessage {
  return {
    id: message.id,
    name: message.name,
    dlc: message.dlc,
    transmitter: message.transmittingNode,
    signals: message
      .getResolvedSignals(db.signalPool, db)
      .map(s => serializeSignalForWebview(s, db, { mergedDescriptions: true })),
    comment: message.comment ?? '',
  };
}

function serializeValueTable(vt: ValueTable): SerializedValueTable {
  const entries: Record<number, string> = {};
  vt.entries.forEach((v, k) => {
    entries[k] = v;
  });
  return { name: vt.name, comment: vt.comment ?? '', entries };
}

function serializeNode(node: Node): SerializedNode {
  return {
    name: node.name,
    comment: node.comment ?? '',
  };
}

function objectTypeToString(o: ObjectType): string {
  const map: Record<ObjectType, string> = {
    [ObjectType.Network]: 'Network',
    [ObjectType.Node]: 'Node',
    [ObjectType.Message]: 'Message',
    [ObjectType.Signal]: 'Signal',
    [ObjectType.EnvironmentVariable]: 'Environment',
  };
  return map[o] ?? 'Network';
}

function serializeAttributeDefinition(def: AttributeDefinition): SerializedAttribute {
  return {
    name: def.name,
    objectType: objectTypeToString(def.objectType),
    valueType: def.valueType,
    minimum: def.minimum,
    maximum: def.maximum,
    defaultValue: def.defaultValue,
    values: def.enumValues,
    comment: '',
  };
}

/** Convert domain aggregate to JSON-safe objects for the webview UI. */
function serializeEnvironmentVariable(ev: EnvironmentVariable): SerializedEnvironmentVariable {
  return { name: ev.name };
}

export function serializeDatabaseForWebview(db: CanDatabase): SerializedCanDatabase {
  return {
    version: db.version,
    nodes: db.nodes.map(serializeNode),
    messages: db.messages.map((m) => serializeMessage(m, db)),
    signalPool: db.signalPool.map(s => serializeSignalForWebview(s, db)),
    attributes: db.attributeDefinitions.map(serializeAttributeDefinition),
    environmentVariables: db.environmentVariables.map(serializeEnvironmentVariable),
    valueTables: db.valueTables.map(serializeValueTable),
  };
}
