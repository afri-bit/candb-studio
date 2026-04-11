import { AttributeValueType } from '../../../core/enums/AttributeValueType';
import { ByteOrder } from '../../../core/enums/ByteOrder';
import { MultiplexIndicator } from '../../../core/enums/MultiplexIndicator';
import { ObjectType } from '../../../core/enums/ObjectType';
import type { ICanDatabaseSerializer } from '../../../core/interfaces/database/ICanDatabaseSerializer';
import type { CanDatabase } from '../../../core/models/database/CanDatabase';
import type { Message } from '../../../core/models/database/Message';
import type { Signal } from '../../../core/models/database/Signal';
import { mergeEffectiveValueDescriptions } from '../../../core/models/database/valueDescriptionMerge';
import {
    encodeOrphanSignals,
    ORPHAN_SIGNALS_MARKER,
} from '../../../presentation/webview/orphanSignalBlob';

function escapeDbcString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Serializer for the DBC (Vector CANdb++) file format.
 * Converts a CanDatabase model back into DBC text.
 *
 * Serializes: VERSION, BU_, BA_DEF_, BO_/SG_, VAL_TABLE_, VAL_, CM_, BA_.
 * Not yet serialized: EV_, SIG_GROUP_.
 */
export class DbcSerializer implements ICanDatabaseSerializer {
    serialize(database: CanDatabase): string {
        const sections: string[] = [];

        sections.push(`VERSION "${database.version}"`);
        sections.push('');
        sections.push(database.nsContent ?? 'NS_ :');
        sections.push('');
        sections.push(database.bsContent ?? 'BS_:');
        sections.push('');
        sections.push(this.serializeNodes(database));
        sections.push('');

        const attrBlock = this.serializeAttributeDefinitions(database);
        if (attrBlock) {
            sections.push(attrBlock);
            sections.push('');
        }

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

        const cmBlock = this.serializeComments(database);
        if (cmBlock) {
            sections.push('');
            sections.push(cmBlock);
        }

        const fdAttrBlock = this.serializeFdAttributes(database);
        if (fdAttrBlock) {
            sections.push('');
            sections.push(fdAttrBlock);
        }

        const baBlock = this.serializeAttributeValues(database);
        if (baBlock) {
            sections.push('');
            sections.push(baBlock);
        }

        // Emit preserved unknown/unsupported sections verbatim (round-trip fidelity)
        if (database.rawUnknownSections.length > 0) {
            for (const block of database.rawUnknownSections) {
                sections.push('');
                sections.push(block);
            }
        }

        const poolOnlyUnreferenced = database.signalPool.filter(
            (s) => !database.isSignalReferencedByMessage(s.name),
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

    /**
     * BA_DEF_ / BA_DEF_DEF_ lines so attribute definitions survive save and re-parse.
     */
    private serializeAttributeDefinitions(database: CanDatabase): string {
        const defs = [...database.attributeDefinitions].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        );
        if (defs.length === 0) {
            return '';
        }
        const lines: string[] = [];
        for (const def of defs) {
            const scope = this.objectTypeToBaDefScope(def.objectType);
            // Network-level attributes have no scope prefix; others get "SCOPE " with a trailing space.
            const scopePrefix = scope ? `${scope} ` : '';
            const vt = def.valueType;
            if (vt === AttributeValueType.String) {
                lines.push(`BA_DEF_ ${scopePrefix}"${escapeDbcString(def.name)}" STRING ;`);
            } else if (vt === AttributeValueType.Enum) {
                const parts = def.enumValues?.length
                    ? def.enumValues.map((v) => `"${escapeDbcString(v)}"`).join(',')
                    : '""';
                lines.push(`BA_DEF_ ${scopePrefix}"${escapeDbcString(def.name)}" ENUM ${parts};`);
            } else {
                const min = def.minimum ?? 0;
                const max = def.maximum ?? 0;
                lines.push(`BA_DEF_ ${scopePrefix}"${escapeDbcString(def.name)}" ${vt} ${min} ${max};`);
            }
            lines.push(this.serializeBaDefDefLine(def));
        }
        return lines.join('\n');
    }

    private objectTypeToBaDefScope(o: ObjectType): string {
        switch (o) {
            case ObjectType.Node:
                return 'BU_';
            case ObjectType.Message:
                return 'BO_';
            case ObjectType.Signal:
                return 'SG_';
            case ObjectType.EnvironmentVariable:
                return 'EV_';
            case ObjectType.Network:
                return ''; // network-level: no scope prefix
            default:
                return 'BO_';
        }
    }

    private serializeBaDefDefLine(def: {
        name: string;
        valueType: AttributeValueType;
        defaultValue: string | number;
    }): string {
        const n = escapeDbcString(def.name);
        const v = def.defaultValue;
        if (
            def.valueType === AttributeValueType.String ||
            def.valueType === AttributeValueType.Enum
        ) {
            return `BA_DEF_DEF_ "${n}" "${escapeDbcString(String(v))}";`;
        }
        if (def.valueType === AttributeValueType.Float) {
            return `BA_DEF_DEF_ "${n}" ${Number(v)};`;
        }
        return `BA_DEF_DEF_ "${n}" ${Math.trunc(Number(v))};`;
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

    /** Serializes CM_ lines for the network, nodes, messages, and signals. */
    private serializeComments(database: CanDatabase): string {
        const lines: string[] = [];

        if (database.comment?.trim()) {
            lines.push(`CM_ "${escapeDbcString(database.comment)}";`);
        }

        for (const node of database.nodes) {
            if (node.comment?.trim()) {
                lines.push(`CM_ BU_ ${node.name} "${escapeDbcString(node.comment)}";`);
            }
        }

        for (const msg of database.messages) {
            if (msg.comment?.trim()) {
                lines.push(`CM_ BO_ ${msg.id} "${escapeDbcString(msg.comment)}";`);
            }
            const resolved = msg.getResolvedSignals(database.signalPool, database);
            for (const sig of resolved) {
                if (sig.comment?.trim()) {
                    lines.push(
                        `CM_ SG_ ${msg.id} ${sig.name} "${escapeDbcString(sig.comment)}";`,
                    );
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Synthesizes BA_DEF_ and BA_ lines for CAN FD messages using the VFrameFormat
     * attribute (Vector CANdb++ convention). Emits only for messages with isFd === true.
     * Handles serialization exclusively so serializeAttributeValues skips VFrameFormat.
     */
    private serializeFdAttributes(database: CanDatabase): string {
        const fdMessages = database.messages.filter((m) => m.isFd);
        if (fdMessages.length === 0) {
            return '';
        }

        const lines: string[] = [];

        // Emit BA_DEF_ only if the database doesn't already have a VFrameFormat definition
        const alreadyDefined = database.attributeDefinitions.some(
            (d) => d.name === 'VFrameFormat',
        );
        if (!alreadyDefined) {
            lines.push(
                'BA_DEF_ BO_ "VFrameFormat" ENUM "StandardCAN","ExtendedCAN","StandardCAN_FD","ExtendedCAN_FD";',
            );
            lines.push('BA_DEF_DEF_ "VFrameFormat" "StandardCAN";');
        }

        for (const msg of fdMessages) {
            // Preserve the original vendor enum index when it exists (e.g. Kvaser uses index 14
            // in a 16-value enum). Fall back to 2/3 only for messages newly added by the extension.
            const stored = database.attributes.find(
                (a) =>
                    a.definitionName === 'VFrameFormat' &&
                    a.objectType === ObjectType.Message &&
                    a.messageId === msg.id,
            );
            const fdIndex =
                stored !== undefined ? stored.value : msg.id > 0x7ff ? 3 : 2;
            lines.push(`BA_ "VFrameFormat" BO_ ${msg.id} ${fdIndex};`);
        }

        return lines.join('\n');
    }

    /** Serializes BA_ attribute value lines. */
    private serializeAttributeValues(database: CanDatabase): string {
        if (database.attributes.length === 0) {
            return '';
        }
        const lines: string[] = [];
        for (const attr of database.attributes) {
            // VFrameFormat is handled exclusively by serializeFdAttributes to avoid double-emit
            if (attr.definitionName === 'VFrameFormat') {
                continue;
            }
            const name = `"${escapeDbcString(attr.definitionName)}"`;
            const valStr =
                typeof attr.value === 'string'
                    ? `"${escapeDbcString(attr.value)}"`
                    : String(attr.value);

            switch (attr.objectType) {
                case ObjectType.Network:
                    lines.push(`BA_ ${name} ${valStr};`);
                    break;
                case ObjectType.Node:
                    lines.push(`BA_ ${name} BU_ ${attr.objectName} ${valStr};`);
                    break;
                case ObjectType.Message:
                    lines.push(`BA_ ${name} BO_ ${attr.messageId} ${valStr};`);
                    break;
                case ObjectType.Signal:
                    lines.push(
                        `BA_ ${name} SG_ ${attr.messageId} ${attr.signalName} ${valStr};`,
                    );
                    break;
            }
        }
        return lines.join('\n');
    }

    private serializeSignal(signal: Signal): string {
        // DBC byte order: 1 = Intel (little-endian), 0 = Motorola (big-endian)
        const byteOrderChar = signal.byteOrder === ByteOrder.LittleEndian ? '1' : '0';
        const signChar = signal.valueType === 1 ? '-' : '+';
        const receivers =
            signal.receivingNodes.length > 0 ? signal.receivingNodes.join(',') : 'Vector__XXX';

        // Mux token: "M " for multiplexor, "m<N> " for multiplexed signal, "" for regular
        let muxToken = '';
        if (signal.multiplexIndicator === MultiplexIndicator.Multiplexor) {
            muxToken = ' M';
        } else if (signal.multiplexIndicator === MultiplexIndicator.MultiplexedSignal) {
            muxToken = ` m${signal.multiplexValue ?? 0}`;
        }

        return `SG_ ${signal.name}${muxToken} : ${signal.startBit}|${signal.bitLength}@${byteOrderChar}${signChar} (${signal.factor},${signal.offset}) [${signal.minimum}|${signal.maximum}] "${signal.unit}" ${receivers}`;
    }
}
