import { Signal } from '../../core/models/database/Signal';
import { ByteOrder } from '../../core/enums/ByteOrder';
import { SignalValueType } from '../../core/enums/SignalValueType';
import { MultiplexIndicator } from '../../core/enums/MultiplexIndicator';
import { ObjectType } from '../../core/enums/ObjectType';
import { AttributeValueType } from '../../core/enums/AttributeValueType';
import type { AttributeDefinition } from '../../core/models/database/AttributeDefinition';

/** Webview `SignalDescriptor` shape (subset used for round-trip). */
export interface WebviewSignalInput {
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
  /** Optional `VAL_TABLE_` name. */
  valueTableName?: string;
}

function signalValueTypeFromWebview(s: WebviewSignalInput): SignalValueType {
  if (s.valueType === 'float') {return SignalValueType.IEEEFloat;}
  if (s.valueType === 'double') {return SignalValueType.IEEEDouble;}
  return s.isSigned ? SignalValueType.Signed : SignalValueType.Unsigned;
}

function multiplexFromWebview(s: WebviewSignalInput): { indicator: MultiplexIndicator; value?: number } {
  if (s.multiplex === 'multiplexor') {
    return { indicator: MultiplexIndicator.Multiplexor };
  }
  if (typeof s.multiplex === 'number') {
    return { indicator: MultiplexIndicator.MultiplexedSignal, value: s.multiplex };
  }
  return { indicator: MultiplexIndicator.None };
}

export function webviewSignalToSignal(input: WebviewSignalInput): Signal {
  const m = multiplexFromWebview(input);
  const vd = new Map<number, string>();
  Object.entries(input.valueDescriptions ?? {}).forEach(([k, v]) => {
    vd.set(Number(k), v);
  });
  return new Signal({
    name: input.name,
    startBit: input.startBit,
    bitLength: input.bitLength,
    byteOrder: input.byteOrder === 'big_endian' ? ByteOrder.BigEndian : ByteOrder.LittleEndian,
    valueType: signalValueTypeFromWebview(input),
    factor: input.factor,
    offset: input.offset,
    minimum: input.minimum,
    maximum: input.maximum,
    unit: input.unit,
    receivingNodes: [...(input.receivers ?? [])],
    valueDescriptions: vd,
    valueTableName: input.valueTableName?.trim() || undefined,
    multiplexIndicator: m.indicator,
    multiplexValue: m.value,
    comment: input.comment || undefined,
  });
}

const OBJECT_TYPE_FROM_WEB: Record<string, ObjectType> = {
  Network: ObjectType.Network,
  Node: ObjectType.Node,
  Message: ObjectType.Message,
  Signal: ObjectType.Signal,
  /** Matches `objectTypeToString` for `EnvironmentVariable` in serializeDatabaseForWebview */
  Environment: ObjectType.EnvironmentVariable,
};

const ATTR_VALUE_FROM_WEB: Record<string, AttributeValueType> = {
  INT: AttributeValueType.Integer,
  FLOAT: AttributeValueType.Float,
  STRING: AttributeValueType.String,
  ENUM: AttributeValueType.Enum,
  HEX: AttributeValueType.Hex,
};

export function patchAttributeDefinition(
  def: AttributeDefinition,
  changes: Record<string, unknown>,
): void {
  if ('name' in changes && typeof changes.name === 'string') {
    def.name = changes.name;
  }
  if ('objectType' in changes && typeof changes.objectType === 'string') {
    const ot = OBJECT_TYPE_FROM_WEB[changes.objectType];
    if (ot !== undefined) {def.objectType = ot;}
  }
  if ('valueType' in changes && typeof changes.valueType === 'string') {
    const vt = ATTR_VALUE_FROM_WEB[changes.valueType];
    if (vt !== undefined) {def.valueType = vt;}
  }
  if ('minimum' in changes && typeof changes.minimum === 'number') {def.minimum = changes.minimum;}
  if ('maximum' in changes && typeof changes.maximum === 'number') {def.maximum = changes.maximum;}
  if ('defaultValue' in changes) {
    def.defaultValue = changes.defaultValue as string | number;
  }
}
