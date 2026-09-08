import type { CanDatabase } from './CanDatabase';
import type { Signal } from './Signal';

/**
 * Merge value table + pool-level overrides + per-message `VAL_` (last wins on duplicate keys).
 */
export function mergeEffectiveValueDescriptions(
    messageId: number,
    poolDef: Signal,
    db: CanDatabase,
): Map<number, string> {
    const out = new Map<number, string>();
    if (poolDef.valueTableName) {
        const vt = db.valueTables.find((t) => t.name === poolDef.valueTableName);
        if (vt) {
            vt.entries.forEach((label, raw) => out.set(raw, label));
        }
    }
    poolDef.valueDescriptions.forEach((label, raw) => out.set(raw, label));
    const per = db.findValueDescription(messageId, poolDef.name);
    if (per) {
        per.descriptions.forEach((label, raw) => out.set(raw, label));
    }
    return out;
}

/**
 * Pool-only merge (Signals tab): table + pool overrides + per-message `VAL_` from
 * referencing frames so labels persist after a DBC save/reload.
 *
 * Duplicate raw keys: **last-wins** in `db.messages` order (named table, then pool
 * `valueDescriptions`, then each referencing frame’s `VAL_`).
 */
export function mergeEffectiveValueDescriptionsForPoolOnly(
    poolDef: Signal,
    db: CanDatabase,
): Map<number, string> {
    const out = new Map<number, string>();
    if (poolDef.valueTableName) {
        const vt = db.valueTables.find((t) => t.name === poolDef.valueTableName);
        if (vt) {
            vt.entries.forEach((label, raw) => out.set(raw, label));
        }
    }
    poolDef.valueDescriptions.forEach((label, raw) => out.set(raw, label));
    // DBC persists a signal's value labels as per-message VAL_ lines; fold them back
    // in so the pool signal renders its labels after a save/reload round-trip.
    for (const message of db.messages) {
        if (!message.findSignalRefByName(poolDef.name)) {
            continue;
        }
        const per = db.findValueDescription(message.id, poolDef.name);
        if (per) {
            per.descriptions.forEach((label, raw) => out.set(raw, label));
        }
    }
    return out;
}
