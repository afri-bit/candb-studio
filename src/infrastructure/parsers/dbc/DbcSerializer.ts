import type { CanDatabase } from '../../../core/models/database/CanDatabase';
import type { Message } from '../../../core/models/database/Message';
import type { Signal } from '../../../core/models/database/Signal';
import type { ICanDatabaseSerializer } from '../../../core/interfaces/database/ICanDatabaseSerializer';
import { ByteOrder } from '../../../core/enums/ByteOrder';
import { mergeEffectiveValueDescriptions } from '../../../core/models/database/valueDescriptionMerge';
import { encodeOrphanSignals, ORPHAN_SIGNALS_MARKER } from '../../../presentation/webview/orphanSignalBlob';

function escapeDbcString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Serializer for the DBC (Vector CANdb++) file format.
 * Converts a CanDatabase model back into DBC text.
 *
 * TODO: Serialize comments (CM_), attribute definitions (BA_DEF_),
 *       attribute values (BA_), value descriptions (VAL_), and environment variables (EV_).
 */
export class DbcSerializer implements ICanDatabaseSerializer {
  serialize(database: CanDatabase): string {
    const sections: string[] = [];

    sections.push(`VERSION "${database.version}"`);
    sections.push('');
    sections.push('NS_ :');
    sections.push('');
    sections.push('BS_:');
    sections.push('');
    sections.push(this.serializeNodes(database));
    sections.push('');

    for (const message of database.messages) {
      sections.push(this.serializeMessage(message, database));
      sections.push('');
    }

    const valTableBlock = this.serializeValueTables(database);
    if (valTableBlock) {
      sections.push('');
      sections.push(valTableBlock);
    }

    const valBlock = this.serializeVal(database);
    if (valBlock) {
      sections.push('');
      sections.push(valBlock);
    }

    const poolOnlyUnreferenced = database.signalPool.filter(
      s => !database.isSignalReferencedByMessage(s.name),
    );
    if (poolOnlyUnreferenced.length > 0) {
      sections.push('');
      sections.push(ORPHAN_SIGNALS_MARKER);
      sections.push(`// ${encodeOrphanSignals(poolOnlyUnreferenced)}`);
    }

    return sections.join('\n');
  }

  readonly supportedExtensions = ['.dbc'];

  private serializeNodes(database: CanDatabase): string {
    const names = database.nodes.map((n) => n.name).join(' ');
    return `BU_: ${names}`;
  }

  private serializeMessage(message: Message, database: CanDatabase): string {
    const lines: string[] = [];
    const transmitter = message.transmittingNode || 'Vector__XXX';
    lines.push(`BO_ ${message.id} ${message.name}: ${message.dlc} ${transmitter}`);

    const resolved = message.getResolvedSignals(database.signalPool, database);
    for (const signal of resolved) {
      lines.push(` ${this.serializeSignal(signal)}`);
    }

    return lines.join('\n');
  }

  private serializeValueTables(database: CanDatabase): string {
    if (database.valueTables.length === 0) {
      return '';
    }
    const lines: string[] = [];
    for (const vt of database.valueTables) {
      if (vt.comment?.trim()) {
        lines.push(`CM_ VAL_TABLE_ ${vt.name} "${escapeDbcString(vt.comment)}"`);
      }
      const parts: string[] = [`VAL_TABLE_ ${vt.name}`];
      const sorted = [...vt.entries.entries()].sort((a, b) => a[0] - b[0]);
      for (const [raw, label] of sorted) {
        parts.push(`${raw} "${escapeDbcString(label)}"`);
      }
      lines.push(`${parts.join(' ')} ;`);
    }
    return lines.join('\n');
  }

  private serializeVal(database: CanDatabase): string {
    const lines: string[] = [];
    for (const msg of database.messages) {
      const resolved = msg.getResolvedSignals(database.signalPool, database);
      for (const sig of resolved) {
        const def = database.findPoolSignalByName(sig.name);
        if (!def) {
          continue;
        }
        const merged = mergeEffectiveValueDescriptions(msg.id, def, database);
        if (merged.size === 0) {
          continue;
        }
        const parts: string[] = [`VAL_ ${msg.id} ${sig.name}`];
        const sorted = [...merged.entries()].sort((a, b) => a[0] - b[0]);
        for (const [raw, label] of sorted) {
          parts.push(`${raw} "${escapeDbcString(label)}"`);
        }
        lines.push(`${parts.join(' ')} ;`);
      }
    }
    return lines.join('\n');
  }

  private serializeSignal(signal: Signal): string {
    // DBC byte order: 1 = Intel (little-endian), 0 = Motorola (big-endian)
    const byteOrderChar = signal.byteOrder === ByteOrder.LittleEndian ? '1' : '0';
    // SignalValueType.Signed = 1; use '-' for signed
    const signChar = signal.valueType === 1 ? '-' : '+';
    const receivers = signal.receivingNodes.length > 0
      ? signal.receivingNodes.join(',')
      : 'Vector__XXX';

    return `SG_ ${signal.name} : ${signal.startBit}|${signal.bitLength}@${byteOrderChar}${signChar} (${signal.factor},${signal.offset}) [${signal.minimum}|${signal.maximum}] "${signal.unit}" ${receivers}`;
  }
}
