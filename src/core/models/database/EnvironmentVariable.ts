/** Data type of an environment variable. */
export enum EnvironmentVariableType {
  Integer = 0,
  Float = 1,
  String = 2,
}

/**
 * A simulation/test variable defined in the CAN database.
 *
 * Environment variables are used in CANdb++ for simulation, testing,
 * and panel-based interaction. They are declared in the `EV_` section
 * of a DBC file.
 */
export class EnvironmentVariable {
  public name: string;
  public type: EnvironmentVariableType;
  public minimum: number;
  public maximum: number;
  public unit: string;
  public initialValue: number;
  public accessNodes: string[];
  public comment?: string;

  constructor(params: {
    name: string;
    type?: EnvironmentVariableType;
    minimum?: number;
    maximum?: number;
    unit?: string;
    initialValue?: number;
    accessNodes?: string[];
    comment?: string;
  }) {
    this.name = params.name;
    this.type = params.type ?? EnvironmentVariableType.Integer;
    this.minimum = params.minimum ?? 0;
    this.maximum = params.maximum ?? 0;
    this.unit = params.unit ?? '';
    this.initialValue = params.initialValue ?? 0;
    this.accessNodes = params.accessNodes ?? [];
    this.comment = params.comment;
  }
}
