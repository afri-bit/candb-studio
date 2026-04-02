import type { CanDatabase } from './CanDatabase';
import type { MessageSignalRef } from './MessageSignalRef';
import { Signal } from './Signal';
import { mergeEffectiveValueDescriptions } from './valueDescriptionMerge';

/**
 * A CAN message definition.
 *
 * Each message has a unique arbitration ID, a data length code (DLC),
 * an optional transmitting node, and zero or more **references** to signals
 * in the database {@link CanDatabase.signalPool} (placement per frame only).
 */
export class Message {
    public id: number;
    public name: string;
    public dlc: number;
    public transmittingNode: string;
    /** References to global pool signals with per-frame layout. */
    public signalRefs: MessageSignalRef[];
    public comment?: string;

    constructor(params: {
        id: number;
        name: string;
        dlc: number;
        transmittingNode?: string;
        signalRefs?: MessageSignalRef[];
        comment?: string;
    }) {
        this.id = params.id;
        this.name = params.name;
        this.dlc = params.dlc;
        this.transmittingNode = params.transmittingNode ?? '';
        this.signalRefs = params.signalRefs ?? [];
        this.comment = params.comment;
    }

    findSignalRefByName(name: string): MessageSignalRef | undefined {
        return this.signalRefs.find((r) => r.signalName === name);
    }

    addSignalRef(ref: MessageSignalRef): void {
        if (this.findSignalRefByName(ref.signalName)) {
            throw new Error(
                `Signal "${ref.signalName}" is already linked to message "${this.name}"`,
            );
        }
        this.signalRefs.push(ref);
    }

    removeSignalRef(name: string): boolean {
        const index = this.signalRefs.findIndex((r) => r.signalName === name);
        if (index === -1) {
            return false;
        }
        this.signalRefs.splice(index, 1);
        return true;
    }

    /**
     * Merge pool definitions with this message's placements (for DBC encoding, decoding, UI).
     */
    getResolvedSignals(pool: Signal[], db: CanDatabase): Signal[] {
        return this.signalRefs.map((ref) => {
            const def = pool.find((s) => s.name === ref.signalName);
            if (!def) {
                throw new Error(
                    `Signal "${ref.signalName}" not in signal pool for message "${this.name}"`,
                );
            }
            const merged = mergeEffectiveValueDescriptions(this.id, def, db);
            return new Signal({
                name: def.name,
                startBit: ref.startBit,
                bitLength: ref.bitLength,
                byteOrder: ref.byteOrder,
                valueType: def.valueType,
                factor: def.factor,
                offset: def.offset,
                minimum: def.minimum,
                maximum: def.maximum,
                unit: def.unit,
                receivingNodes: [...def.receivingNodes],
                valueDescriptions: merged,
                valueTableName: def.valueTableName,
                multiplexIndicator: def.multiplexIndicator,
                multiplexValue: def.multiplexValue,
                comment: def.comment,
            });
        });
    }

    /** Resolved signal (pool + this message's placement), or undefined if not linked. */
    findSignalByName(name: string, pool: Signal[], db: CanDatabase): Signal | undefined {
        const ref = this.findSignalRefByName(name);
        if (!ref) {
            return undefined;
        }
        const def = pool.find((s) => s.name === name);
        if (!def) {
            return undefined;
        }
        const merged = mergeEffectiveValueDescriptions(this.id, def, db);
        return new Signal({
            name: def.name,
            startBit: ref.startBit,
            bitLength: ref.bitLength,
            byteOrder: ref.byteOrder,
            valueType: def.valueType,
            factor: def.factor,
            offset: def.offset,
            minimum: def.minimum,
            maximum: def.maximum,
            unit: def.unit,
            receivingNodes: [...def.receivingNodes],
            valueDescriptions: merged,
            valueTableName: def.valueTableName,
            multiplexIndicator: def.multiplexIndicator,
            multiplexValue: def.multiplexValue,
            comment: def.comment,
        });
    }

    /** Total bits available in this message's data field (DLC × 8). */
    get totalBits(): number {
        return this.dlc * 8;
    }

    /** Whether this message uses signal multiplexing (resolved from pool). */
    isMultiplexed(pool: Signal[], db: CanDatabase): boolean {
        return this.getResolvedSignals(pool, db).some((s) => s.isMultiplexor);
    }

    /** Format the message ID as a hex string (e.g. "0x1A3"). */
    get idHex(): string {
        return `0x${this.id.toString(16).toUpperCase()}`;
    }
}
