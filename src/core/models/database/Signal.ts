import { ByteOrder } from '../../enums/ByteOrder';
import { SignalValueType } from '../../enums/SignalValueType';
import { MultiplexIndicator } from '../../enums/MultiplexIndicator';

/**
 * A signal packed within a CAN message.
 *
 * Signals describe how to extract a meaningful value from the raw data bytes
 * of a CAN frame: bit position, length, byte order, and a linear conversion
 * (physical = raw × factor + offset).
 */
export class Signal {
  public name: string;
  public startBit: number;
  public bitLength: number;
  public byteOrder: ByteOrder;
  public valueType: SignalValueType;
  public factor: number;
  public offset: number;
  public minimum: number;
  public maximum: number;
  public unit: string;
  public receivingNodes: string[];
  public valueDescriptions: Map<number, string>;
  /** Optional `VAL_TABLE_` name; merged with {@link valueDescriptions} (overrides). */
  public valueTableName?: string;
  public multiplexIndicator: MultiplexIndicator;
  public multiplexValue?: number;
  public comment?: string;

  constructor(params: {
    name: string;
    startBit: number;
    bitLength: number;
    byteOrder?: ByteOrder;
    valueType?: SignalValueType;
    factor?: number;
    offset?: number;
    minimum?: number;
    maximum?: number;
    unit?: string;
    receivingNodes?: string[];
    valueDescriptions?: Map<number, string>;
    valueTableName?: string;
    multiplexIndicator?: MultiplexIndicator;
    multiplexValue?: number;
    comment?: string;
  }) {
    this.name = params.name;
    this.startBit = params.startBit;
    this.bitLength = params.bitLength;
    this.byteOrder = params.byteOrder ?? ByteOrder.LittleEndian;
    this.valueType = params.valueType ?? SignalValueType.Unsigned;
    this.factor = params.factor ?? 1;
    this.offset = params.offset ?? 0;
    this.minimum = params.minimum ?? 0;
    this.maximum = params.maximum ?? 0;
    this.unit = params.unit ?? '';
    this.receivingNodes = params.receivingNodes ?? [];
    this.valueDescriptions = params.valueDescriptions ?? new Map();
    this.valueTableName = params.valueTableName;
    this.multiplexIndicator = params.multiplexIndicator ?? MultiplexIndicator.None;
    this.multiplexValue = params.multiplexValue;
    this.comment = params.comment;
  }

  /** Convert a raw integer value to a physical value using factor and offset. */
  rawToPhysical(rawValue: number): number {
    return rawValue * this.factor + this.offset;
  }

  /** Convert a physical value to a raw integer value using factor and offset. */
  physicalToRaw(physicalValue: number): number {
    return (physicalValue - this.offset) / this.factor;
  }

  get isMultiplexor(): boolean {
    return this.multiplexIndicator === MultiplexIndicator.Multiplexor;
  }

  get isMultiplexed(): boolean {
    return this.multiplexIndicator === MultiplexIndicator.MultiplexedSignal;
  }
}
