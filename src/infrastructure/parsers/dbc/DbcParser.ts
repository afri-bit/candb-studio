import { CanDatabase } from '../../../core/models/database/CanDatabase';
import { Signal } from '../../../core/models/database/Signal';
import { Message } from '../../../core/models/database/Message';
import { Node } from '../../../core/models/database/Node';
import type { ICanDatabaseParser } from '../../../core/interfaces/database/ICanDatabaseParser';
import { ByteOrder } from '../../../core/enums/ByteOrder';
import { ParseError } from '../../../shared/errors/ParseError';
import { DbcTokenizer } from './DbcTokenizer';
import { parseOrphanSignalsFromDbcContent } from '../../../presentation/webview/orphanSignalBlob';
import { ValueTable } from '../../../core/models/database/ValueTable';

/** Parse `0 "Off" 1 "On"` pairs from the tail of a `VAL_` / `VAL_TABLE_` line. */
export function parseDbcValuePairs(s: string): Map<number, string> {
  const m = new Map<number, string>();
  const re = /(\d+)\s+"([^"]*)"/g;
  let match;
  while ((match = re.exec(s)) !== null) {
    m.set(parseInt(match[1], 10), match[2]);
  }
  return m;
}

/** Reverse `escapeDbcString` for `CM_ VAL_TABLE_ ... "..."` quoted text. */
function unescapeDbcQuotedString(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === '\\' || n === '"') {
        out += n;
        i++;
        continue;
      }
    }
    out += s[i];
  }
  return out;
}

/**
 * Parser for the DBC (Vector CANdb++) file format.
 * Converts raw DBC text into a CanDatabase domain model.
 *
 * TODO: Replace the line-based approach with full token-stream parsing
 *       to handle all DBC sections (comments, attributes, value descriptions, etc.)
 */
export class DbcParser implements ICanDatabaseParser {
  parse(content: string): CanDatabase {
    const database = new CanDatabase();

    try {
      // Validate that there's content to parse (tokenizer used for future use)
      const _tokenizer = new DbcTokenizer(content);
      this.parseLines(content, database);
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(
        `Failed to parse DBC file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    for (const s of parseOrphanSignalsFromDbcContent(content)) {
      if (!database.findPoolSignalByName(s.name)) {
        database.signalPool.push(s);
      }
    }

    return database;
  }

  readonly supportedExtensions = ['.dbc'];

  private parseLines(content: string, database: CanDatabase): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('VERSION')) {
        this.parseVersion(line, database);
      } else if (line.startsWith('BU_:')) {
        this.parseNodes(line, database);
      } else if (line.startsWith('BO_ ')) {
        i = this.parseMessage(lines, i, database);
      } else if (line.startsWith('CM_ VAL_TABLE_')) {
        this.parseCmValTableLine(line, database);
      } else if (line.startsWith('VAL_TABLE_')) {
        this.parseValTableLine(line, database);
      } else if (line.startsWith('VAL_ ')) {
        this.parseValLine(line, database);
      }
      // TODO: Parse CM_, BA_DEF_, BA_DEF_DEF_, BA_, EV_, SIG_GROUP_
    }
  }

  private parseCmValTableLine(line: string, database: CanDatabase): void {
    const trimmed = line.trim();
    const rest = trimmed.slice('CM_ VAL_TABLE_'.length).trim();
    const semi = rest.lastIndexOf(';');
    const body = semi >= 0 ? rest.slice(0, semi).trim() : rest;
    const m = body.match(/^(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/);
    if (!m) {
      return;
    }
    const name = m[1];
    const comment = unescapeDbcQuotedString(m[2]);
    const existing = database.findValueTableByName(name);
    if (existing) {
      existing.comment = comment || undefined;
    } else {
      database.valueTables.push(new ValueTable(name, new Map(), comment || undefined));
    }
  }

  private parseValTableLine(line: string, database: CanDatabase): void {
    const trimmed = line.trim();
    const rest = trimmed.slice('VAL_TABLE_'.length).trim();
    const semi = rest.lastIndexOf(';');
    const body = semi >= 0 ? rest.slice(0, semi).trim() : rest;
    // Allow `VAL_TABLE_ Name ;` with no value pairs (empty enumeration).
    const nameMatch = body.match(/^(\w+)(?:\s+(.+))?$/);
    if (!nameMatch) {
      return;
    }
    const name = nameMatch[1];
    const pairsTail = (nameMatch[2] ?? '').trim();
    const entries = parseDbcValuePairs(pairsTail);
    const existing = database.findValueTableByName(name);
    if (existing) {
      entries.forEach((v, k) => existing.entries.set(k, v));
    } else {
      database.valueTables.push(new ValueTable(name, entries));
    }
  }

  private parseValLine(line: string, database: CanDatabase): void {
    const trimmed = line.trim();
    const rest = trimmed.slice('VAL_'.length).trim();
    const semi = rest.lastIndexOf(';');
    const body = semi >= 0 ? rest.slice(0, semi).trim() : rest;
    const m = body.match(/^(\S+)\s+(\w+)\s+(.+)$/);
    if (!m) {
      return;
    }
    const msgId = parseInt(m[1], 0);
    const sigName = m[2];
    const entries = parseDbcValuePairs(m[3]);
    database.upsertValueDescription(msgId, sigName, entries);
  }

  private parseVersion(line: string, database: CanDatabase): void {
    const match = line.match(/VERSION\s+"([^"]*)"/);
    if (match) {
      database.version = match[1];
    }
  }

  private parseNodes(line: string, database: CanDatabase): void {
    const parts = line.replace('BU_:', '').trim().split(/\s+/);
    for (const name of parts) {
      if (name) {
        try {
          database.addNode(new Node(name));
        } catch {
          // Node already exists, skip
        }
      }
    }
  }

  private parseMessage(lines: string[], startIndex: number, database: CanDatabase): number {
    const line = lines[startIndex].trim();
    const match = line.match(/BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/);
    if (!match) {
      return startIndex;
    }

    const message = new Message({
      id: parseInt(match[1], 10),
      name: match[2],
      dlc: parseInt(match[3], 10),
      transmittingNode: match[4],
    });

    let j = startIndex + 1;
    while (j < lines.length) {
      const sigLine = lines[j].trim();
      if (!sigLine.startsWith('SG_ ')) {
        break;
      }
      const signal = this.parseSignal(sigLine);
      if (signal) {
        try {
          if (!database.findPoolSignalByName(signal.name)) {
            database.addPoolSignal(signal);
          }
          message.addSignalRef({
            signalName: signal.name,
            startBit: signal.startBit,
            bitLength: signal.bitLength,
            byteOrder: signal.byteOrder,
          });
        } catch {
          // Duplicate link in same message or pool conflict, skip
        }
      }
      j++;
    }

    try {
      database.addMessage(message);
    } catch {
      // Message already exists, skip
    }

    return j - 1;
  }

  private parseSignal(line: string): Signal | null {
    // DBC signal format:
    // SG_ name [mux] : startBit|bitLength@byteOrder(+|-) (factor,offset) [min|max] "unit" receivers
    const match = line.match(
      /SG_\s+(\w+)(?:\s+\w*)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"\s*(.*)/,
    );
    if (!match) {
      return null;
    }

    return new Signal({
      name: match[1],
      startBit: parseInt(match[2], 10),
      bitLength: parseInt(match[3], 10),
      byteOrder: match[4] === '1' ? ByteOrder.LittleEndian : ByteOrder.BigEndian,
      factor: parseFloat(match[6]),
      offset: parseFloat(match[7]),
      minimum: parseFloat(match[8]),
      maximum: parseFloat(match[9]),
      unit: match[10],
      receivingNodes: match[11]
        ? match[11].split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
    });
  }
}
