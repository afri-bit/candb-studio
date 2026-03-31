import { Message } from './Message';
import { Node } from './Node';
import { Signal } from './Signal';
import { AttributeDefinition } from './AttributeDefinition';
import { Attribute } from './Attribute';
import { ValueDescription } from './ValueDescription';
import { EnvironmentVariable } from './EnvironmentVariable';
import { SignalGroup } from './SignalGroup';
import { ValueTable } from './ValueTable';

/**
 * Root aggregate for a CAN database.
 *
 * Represents the complete contents of a `.dbc` file: nodes, messages
 * (with their signals), attribute definitions/values, value descriptions,
 * environment variables, and signal groups.
 */
export class CanDatabase {
  public version: string;
  public nodes: Node[];
  public messages: Message[];
  /**
   * Global signal definitions (unique names). Messages reference these by name with per-frame placement.
   * Unreferenced-only entries persist in the DBC extension block; assigned signals also live here.
   */
  public signalPool: Signal[];
  public attributeDefinitions: AttributeDefinition[];
  public attributes: Attribute[];
  public valueDescriptions: ValueDescription[];
  public environmentVariables: EnvironmentVariable[];
  public signalGroups: SignalGroup[];
  /** Named enumerations (`VAL_TABLE_`). */
  public valueTables: ValueTable[];
  public comment?: string;

  constructor(params?: {
    version?: string;
    nodes?: Node[];
    messages?: Message[];
    signalPool?: Signal[];
    attributeDefinitions?: AttributeDefinition[];
    attributes?: Attribute[];
    valueDescriptions?: ValueDescription[];
    environmentVariables?: EnvironmentVariable[];
    signalGroups?: SignalGroup[];
    valueTables?: ValueTable[];
    comment?: string;
  }) {
    this.version = params?.version ?? '';
    this.nodes = params?.nodes ?? [];
    this.messages = params?.messages ?? [];
    this.signalPool = params?.signalPool ?? [];
    this.attributeDefinitions = params?.attributeDefinitions ?? [];
    this.attributes = params?.attributes ?? [];
    this.valueDescriptions = params?.valueDescriptions ?? [];
    this.environmentVariables = params?.environmentVariables ?? [];
    this.signalGroups = params?.signalGroups ?? [];
    this.valueTables = params?.valueTables ?? [];
    this.comment = params?.comment;
  }

  /* ── Message operations ────────────────────────────────── */

  findMessageById(id: number): Message | undefined {
    return this.messages.find(m => m.id === id);
  }

  findMessageByName(name: string): Message | undefined {
    return this.messages.find(m => m.name === name);
  }

  findPoolSignalByName(name: string): Signal | undefined {
    return this.signalPool.find(s => s.name === name);
  }

  /** True if any message links this pool signal. */
  isSignalReferencedByMessage(signalName: string): boolean {
    return this.messages.some(m => m.signalRefs.some(r => r.signalName === signalName));
  }

  addMessage(message: Message): void {
    if (this.findMessageById(message.id)) {
      throw new Error(`Message with ID ${message.idHex} already exists`);
    }
    this.messages.push(message);
  }

  removeMessage(id: number): boolean {
    const index = this.messages.findIndex(m => m.id === id);
    if (index === -1) { return false; }
    this.messages.splice(index, 1);
    return true;
  }

  addPoolSignal(signal: Signal): void {
    if (this.findPoolSignalByName(signal.name)) {
      throw new Error(`Signal "${signal.name}" already exists in the pool`);
    }
    this.signalPool.push(signal);
  }

  removePoolSignal(name: string): boolean {
    if (this.isSignalReferencedByMessage(name)) {
      throw new Error(`Signal "${name}" is still assigned to one or more messages`);
    }
    const index = this.signalPool.findIndex(s => s.name === name);
    if (index === -1) { return false; }
    this.signalPool.splice(index, 1);
    return true;
  }

  /* ── Node operations ───────────────────────────────────── */

  findNodeByName(name: string): Node | undefined {
    return this.nodes.find(n => n.name === name);
  }

  addNode(node: Node): void {
    if (this.findNodeByName(node.name)) {
      throw new Error(`Node "${node.name}" already exists`);
    }
    this.nodes.push(node);
  }

  removeNode(name: string): boolean {
    const index = this.nodes.findIndex(n => n.name === name);
    if (index === -1) { return false; }
    this.nodes.splice(index, 1);
    return true;
  }

  /* ── Attribute Definition operations ───────────────────── */

  findAttributeDefinition(name: string): AttributeDefinition | undefined {
    return this.attributeDefinitions.find(ad => ad.name === name);
  }

  addAttributeDefinition(def: AttributeDefinition): void {
    if (this.findAttributeDefinition(def.name)) {
      throw new Error(`Attribute definition "${def.name}" already exists`);
    }
    this.attributeDefinitions.push(def);
  }

  /* ── Environment Variable operations ───────────────────── */

  findEnvironmentVariable(name: string): EnvironmentVariable | undefined {
    return this.environmentVariables.find(ev => ev.name === name);
  }

  /* ── Value Description operations ──────────────────────── */

  findValueDescription(messageId: number, signalName: string): ValueDescription | undefined {
    return this.valueDescriptions.find(
      vd => vd.messageId === messageId && vd.signalName === signalName,
    );
  }

  findValueTableByName(name: string): ValueTable | undefined {
    return this.valueTables.find(t => t.name === name);
  }

  upsertValueDescription(messageId: number, signalName: string, entries: Map<number, string>): void {
    const existing = this.findValueDescription(messageId, signalName);
    if (existing) {
      entries.forEach((v, k) => existing.descriptions.set(k, v));
    } else {
      this.valueDescriptions.push(new ValueDescription(messageId, signalName, new Map(entries)));
    }
  }

  addValueTable(table: ValueTable): void {
    if (this.findValueTableByName(table.name)) {
      throw new Error(`Value table "${table.name}" already exists`);
    }
    this.valueTables.push(table);
  }

  removeValueTable(name: string): boolean {
    const i = this.valueTables.findIndex(t => t.name === name);
    if (i === -1) {
      return false;
    }
    this.valueTables.splice(i, 1);
    for (const s of this.signalPool) {
      if (s.valueTableName === name) {
        s.valueTableName = undefined;
      }
    }
    return true;
  }
}
