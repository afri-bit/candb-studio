/**
 * An ECU (Electronic Control Unit) on the CAN bus.
 *
 * Nodes are the logical participants that transmit and receive messages.
 * In a DBC file, nodes are listed in the `BU_:` section.
 */
export class Node {
  public name: string;
  public comment?: string;

  constructor(name: string, comment?: string) {
    this.name = name;
    this.comment = comment;
  }
}
