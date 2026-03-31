import { AttributeValueType } from '../../enums/AttributeValueType';
import { ObjectType } from '../../enums/ObjectType';

/**
 * Definition (schema) for a user-defined attribute in a CAN database.
 *
 * Attribute definitions declare the name, target object type, value type,
 * allowed range, and default value. Individual {@link Attribute} instances
 * then assign concrete values per object.
 */
export class AttributeDefinition {
  public name: string;
  public objectType: ObjectType;
  public valueType: AttributeValueType;
  public minimum?: number;
  public maximum?: number;
  public defaultValue: string | number;
  public enumValues?: string[];
  /** Optional documentation (not written to DBC until CM_ / BA_DEF_ comment support is added). */
  public comment: string;

  constructor(params: {
    name: string;
    objectType: ObjectType;
    valueType: AttributeValueType;
    minimum?: number;
    maximum?: number;
    defaultValue: string | number;
    enumValues?: string[];
    comment?: string;
  }) {
    this.name = params.name;
    this.objectType = params.objectType;
    this.valueType = params.valueType;
    this.minimum = params.minimum;
    this.maximum = params.maximum;
    this.defaultValue = params.defaultValue;
    this.enumValues = params.enumValues;
    this.comment = params.comment ?? '';
  }

  /** Whether the value is constrained by a numeric range. */
  get hasRange(): boolean {
    return this.minimum !== undefined && this.maximum !== undefined;
  }

  /** Whether this is an enumerated attribute with a fixed set of choices. */
  get isEnum(): boolean {
    return this.valueType === AttributeValueType.Enum && !!this.enumValues?.length;
  }
}
