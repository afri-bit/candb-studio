import { AttributeValueType } from '../../../core/enums/AttributeValueType';
import { ByteOrder } from '../../../core/enums/ByteOrder';
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
 * TODO: Serialize comments (CM_), attribute values (BA_), environment variables (EV_).
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
            const vt = def.valueType;
            if (vt === AttributeValueType.String) {
                lines.push(`BA_DEF_ ${scope} "${escapeDbcString(def.name)}" STRING ;`);
            } else if (vt === AttributeValueType.Enum) {
                const parts = def.enumValues?.length
                    ? def.enumValues.map((v) => `"${escapeDbcString(v)}"`).join(',')
                    : '""';
                lines.push(`BA_DEF_ ${scope} "${escapeDbcString(def.name)}" ENUM ${parts};`);
            } else {
                const min = def.minimum ?? 0;
                const max = def.maximum ?? 0;
                lines.push(`BA_DEF_ ${scope} "${escapeDbcString(def.name)}" ${vt} ${min} ${max};`);
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

    private serializeSignal(signal: Signal): string {
        // DBC byte order: 1 = Intel (little-endian), 0 = Motorola (big-endian)
        const byteOrderChar = signal.byteOrder === ByteOrder.LittleEndian ? '1' : '0';
        // SignalValueType.Signed = 1; use '-' for signed
        const signChar = signal.valueType === 1 ? '-' : '+';
        const receivers =
            signal.receivingNodes.length > 0 ? signal.receivingNodes.join(',') : 'Vector__XXX';

        return `SG_ ${signal.name} : ${signal.startBit}|${signal.bitLength}@${byteOrderChar}${signChar} (${signal.factor},${signal.offset}) [${signal.minimum}|${signal.maximum}] "${signal.unit}" ${receivers}`;
    }
}
