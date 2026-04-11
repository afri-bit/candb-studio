import { AttributeValueType } from '../../../core/enums/AttributeValueType';
import { ByteOrder } from '../../../core/enums/ByteOrder';
import { ObjectType } from '../../../core/enums/ObjectType';
import type { ICanDatabaseParser } from '../../../core/interfaces/database/ICanDatabaseParser';
import { Attribute } from '../../../core/models/database/Attribute';
import { AttributeDefinition } from '../../../core/models/database/AttributeDefinition';
import { CanDatabase } from '../../../core/models/database/CanDatabase';
import { Message } from '../../../core/models/database/Message';
import { Node } from '../../../core/models/database/Node';
import { Signal } from '../../../core/models/database/Signal';
import { ValueTable } from '../../../core/models/database/ValueTable';
import { parseOrphanSignalsFromDbcContent } from '../../../presentation/webview/orphanSignalBlob';
import { ParseError } from '../../../shared/errors/ParseError';
import { DbcTokenizer } from './DbcTokenizer';

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
 * Parses: VERSION, BU_, BO_/SG_, VAL_TABLE_, VAL_, CM_, BA_DEF_, BA_DEF_DEF_, BA_.
 * Not yet parsed: EV_, SIG_GROUP_, SG_MUL_VAL_, BO_TX_BU_.
 */
export class DbcParser implements ICanDatabaseParser {
    parse(content: string): CanDatabase {
        const database = new CanDatabase();

        try {
            // Validate that there's content to parse (tokenizer used for future use)
            const _tokenizer = new DbcTokenizer(content);
            this.parseLines(content, database);
        } catch (err: unknown) {
            if (err instanceof ParseError) {
                throw err;
            }
            throw new ParseError(
                `Failed to parse DBC file: ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        for (const s of parseOrphanSignalsFromDbcContent(content)) {
            if (!database.findPoolSignalByName(s.name)) {
                database.signalPool.push(s);
            }
        }

        this.applyFdAttributes(database);

        return database;
    }

    readonly supportedExtensions = ['.dbc'];

    /**
     * Post-parse pass: reads `VFrameFormat` BA_ attributes and sets `Message.isFd = true`
     * for any message whose VFrameFormat enum index is ≥ 2 (StandardCAN_FD or ExtendedCAN_FD).
     * This is the industry-standard mechanism used by Vector CANdb++ and PEAK tools.
     */
    private applyFdAttributes(database: CanDatabase): void {
        for (const attr of database.attributes) {
            if (attr.definitionName !== 'VFrameFormat') {
                continue;
            }
            if (attr.objectType !== ObjectType.Message || attr.messageId === undefined) {
                continue;
            }
            // Enum value ≥ 2 means FD (tolerant of different tool index conventions)
            const val = typeof attr.value === 'number' ? attr.value : parseInt(String(attr.value), 10);
            if (!isNaN(val) && val >= 2) {
                const msg = database.findMessageById(attr.messageId);
                if (msg) {
                    msg.isFd = true;
                }
            }
        }
    }

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
            } else if (line.startsWith('BA_DEF_DEF_')) {
                this.parseBaDefDef(line, database);
            } else if (line.startsWith('BA_DEF_')) {
                this.parseBaDef(line, database);
            } else if (line.startsWith('CM_') && !line.startsWith('CM_ VAL_TABLE_')) {
                i = this.parseCmLines(lines, i, database);
            } else if (line.startsWith('BA_ ')) {
                this.parseBaLine(line, database);
            }
        }
    }

    /** DBC structural keywords that delimit sections — used to guard CM_ line accumulation. */
    private static readonly DBC_SECTION_KEYWORDS = [
        'BO_ ',
        'BU_:',
        'VAL_TABLE_',
        'VAL_ ',
        'BA_DEF_DEF_',
        'BA_DEF_',
        'BA_ ',
        'EV_ ',
        'SIG_GROUP_',
        'BO_TX_BU_',
        'SG_MUL_VAL_',
        'NS_ ',
        'BS_:',
    ];

    /**
     * Accumulates lines until a CM_ entry is complete (closing `";`), then applies it.
     * Stops before consuming any structural DBC section keyword to prevent
     * swallowing BO_/BA_/VAL_ blocks when a CM_ entry has no terminating `";`.
     * Returns the index of the last consumed line.
     */
    private parseCmLines(lines: string[], startIndex: number, database: CanDatabase): number {
        let text = lines[startIndex];
        let i = startIndex;
        while (!this.cmEntryComplete(text) && i + 1 < lines.length) {
            const nextLine = lines[i + 1].trimStart();
            if (DbcParser.DBC_SECTION_KEYWORDS.some((kw) => nextLine.startsWith(kw))) {
                break;
            }
            i++;
            text += '\n' + lines[i];
        }
        this.applyCmEntry(text.trim(), database);
        return i;
    }

    /** Returns true once the accumulated CM_ text contains a closed quoted string followed by `;`. */
    private cmEntryComplete(text: string): boolean {
        let inStr = false;
        for (let i = 0; i < text.length; i++) {
            if (!inStr) {
                if (text[i] === '"') {
                    inStr = true;
                }
            } else {
                if (text[i] === '\\') {
                    i++; // skip escaped char
                } else if (text[i] === '"') {
                    const after = text.slice(i + 1).trimStart();
                    if (after.startsWith(';')) {
                        return true;
                    }
                    inStr = false;
                }
            }
        }
        return false;
    }

    /** Parses one CM_ entry (possibly multi-line) and stores the comment on the target object. */
    private applyCmEntry(text: string, database: CanDatabase): void {
        const rest = text.slice('CM_'.length).trimStart();

        let keyword: string | null = null;
        let args: string[] = [];
        let body = rest;

        if (rest.startsWith('BU_ ')) {
            keyword = 'BU_';
            body = rest.slice('BU_'.length).trimStart();
            const m = body.match(/^(\w+)\s*/);
            if (!m) {
                return;
            }
            args = [m[1]];
            body = body.slice(m[0].length);
        } else if (rest.startsWith('BO_ ')) {
            keyword = 'BO_';
            body = rest.slice('BO_'.length).trimStart();
            const m = body.match(/^(\d+)\s*/);
            if (!m) {
                return;
            }
            args = [m[1]];
            body = body.slice(m[0].length);
        } else if (rest.startsWith('SG_ ')) {
            keyword = 'SG_';
            body = rest.slice('SG_'.length).trimStart();
            const m = body.match(/^(\d+)\s+(\w+)\s*/);
            if (!m) {
                return;
            }
            args = [m[1], m[2]];
            body = body.slice(m[0].length);
        }

        // Extract quoted comment — the `s` flag lets `.` match embedded newlines
        const qm = body.match(/^"((?:[^"\\]|\\[\s\S])*?)"\s*;/s);
        if (!qm) {
            return;
        }
        const comment = unescapeDbcQuotedString(qm[1]);

        if (!keyword) {
            database.comment = comment;
        } else if (keyword === 'BU_') {
            const node = database.findNodeByName(args[0]);
            if (node) {
                node.comment = comment;
            }
        } else if (keyword === 'BO_') {
            const msg = database.findMessageById(parseInt(args[0], 10));
            if (msg) {
                msg.comment = comment;
            }
        } else if (keyword === 'SG_') {
            const sig = database.findPoolSignalByName(args[1]);
            if (sig) {
                sig.comment = comment;
            }
        }
    }

    /**
     * Parses a single-line `BA_` entry and appends it to `database.attributes`.
     * Format: BA_ "<name>" [BU_ <node> | BO_ <id> | SG_ <id> <sig>] <value>;
     */
    private parseBaLine(line: string, database: CanDatabase): void {
        const nameMatch = line.match(/^BA_\s+"([^"]+)"\s+(.+?)\s*;?\s*$/);
        if (!nameMatch) {
            return;
        }

        const defName = nameMatch[1];
        let rest = nameMatch[2].trim();

        let objectType = ObjectType.Network;
        let objectName: string | undefined;
        let messageId: number | undefined;
        let signalName: string | undefined;

        if (rest.startsWith('BU_ ')) {
            objectType = ObjectType.Node;
            const m = rest.match(/^BU_\s+(\w+)\s+(.*)/);
            if (!m) {
                return;
            }
            objectName = m[1];
            rest = m[2].trim();
        } else if (rest.startsWith('BO_ ')) {
            objectType = ObjectType.Message;
            const m = rest.match(/^BO_\s+(\d+)\s+(.*)/);
            if (!m) {
                return;
            }
            messageId = parseInt(m[1], 10);
            rest = m[2].trim();
        } else if (rest.startsWith('SG_ ')) {
            objectType = ObjectType.Signal;
            const m = rest.match(/^SG_\s+(\d+)\s+(\w+)\s+(.*)/);
            if (!m) {
                return;
            }
            messageId = parseInt(m[1], 10);
            signalName = m[2];
            rest = m[3].trim();
        }

        rest = rest.replace(/\s*;\s*$/, '');

        database.attributes.push(
            new Attribute({
                definitionName: defName,
                objectType,
                value: this.parseAttributeValue(rest),
                objectName,
                messageId,
                signalName,
            }),
        );
    }

    private parseAttributeValue(raw: string): string | number {
        if (raw.startsWith('"')) {
            const m = raw.match(/^"((?:[^"\\]|\\[\s\S])*)"$/s);
            return m ? unescapeDbcQuotedString(m[1]) : raw;
        }
        const n = Number(raw);
        return isNaN(n) ? raw : n;
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

    private parseBaDef(line: string, database: CanDatabase): void {
        const m = line.match(
            /^BA_DEF_\s+(BU_|BO_|SG_|EV_)\s+"([^"]+)"\s+(INT|FLOAT|STRING|ENUM|HEX)\s*(.*?)\s*;$/i,
        );
        if (!m) {
            return;
        }
        const prefix = m[1];
        const name = m[2];
        const vtToken = m[3].toUpperCase();
        const tail = (m[4] ?? '').trim();

        if (database.findAttributeDefinition(name)) {
            return;
        }

        const objectType = this.baDefPrefixToObjectType(prefix);
        const valueType = this.tokenToAttributeValueType(vtToken);
        let minimum: number | undefined;
        let maximum: number | undefined;
        let enumValues: string[] | undefined;

        if (
            valueType === AttributeValueType.Integer ||
            valueType === AttributeValueType.Float ||
            valueType === AttributeValueType.Hex
        ) {
            const nums = tail
                .split(/\s+/)
                .filter(Boolean)
                .map((x) => parseFloat(x));
            minimum = nums[0] ?? 0;
            maximum = nums[1] ?? 0;
        } else if (valueType === AttributeValueType.Enum) {
            enumValues = [];
            const re = /"((?:[^"\\]|\\.)*)"/g;
            let em;
            while ((em = re.exec(tail)) !== null) {
                enumValues.push(unescapeDbcQuotedString(em[1]));
            }
        }

        const def = new AttributeDefinition({
            name,
            objectType,
            valueType,
            minimum,
            maximum,
            defaultValue:
                valueType === AttributeValueType.String || valueType === AttributeValueType.Enum
                    ? ''
                    : 0,
            enumValues,
            comment: '',
        });
        database.addAttributeDefinition(def);
    }

    private parseBaDefDef(line: string, database: CanDatabase): void {
        let m = line.match(/^BA_DEF_DEF_\s+"([^"]+)"\s+(.+?)\s*;$/);
        if (!m) {
            m = line.match(/^BA_DEF_DEF_\s+(\S+)\s+(.+?)\s*;$/);
        }
        if (!m) {
            return;
        }
        const name = m[1];
        const raw = m[2].trim();
        const def = database.findAttributeDefinition(name);
        if (!def) {
            return;
        }
        def.defaultValue = this.parseAttributeDefaultRaw(raw, def.valueType);
    }

    private parseAttributeDefaultRaw(raw: string, vt: AttributeValueType): string | number {
        if (raw.startsWith('"')) {
            return unescapeDbcQuotedString(raw.slice(1, -1));
        }
        if (vt === AttributeValueType.Float) {
            return parseFloat(raw);
        }
        if (vt === AttributeValueType.String || vt === AttributeValueType.Enum) {
            return raw;
        }
        return parseInt(raw, 10);
    }

    private baDefPrefixToObjectType(prefix: string): ObjectType {
        switch (prefix) {
            case 'BU_':
                return ObjectType.Node;
            case 'BO_':
                return ObjectType.Message;
            case 'SG_':
                return ObjectType.Signal;
            case 'EV_':
                return ObjectType.EnvironmentVariable;
            default:
                return ObjectType.Message;
        }
    }

    private tokenToAttributeValueType(token: string): AttributeValueType {
        switch (token) {
            case 'INT':
                return AttributeValueType.Integer;
            case 'FLOAT':
                return AttributeValueType.Float;
            case 'STRING':
                return AttributeValueType.String;
            case 'ENUM':
                return AttributeValueType.Enum;
            case 'HEX':
                return AttributeValueType.Hex;
            default:
                return AttributeValueType.Integer;
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
                ? match[11]
                      .split(',')
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                : [],
        });
    }
}
