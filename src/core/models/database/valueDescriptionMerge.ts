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
    const vt = db.valueTables.find(t => t.name === poolDef.valueTableName);
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

/** Pool-only merge (Signals tab): table + pool overrides, no per-message VAL_. */
export function mergeEffectiveValueDescriptionsForPoolOnly(
  poolDef: Signal,
  db: CanDatabase,
): Map<number, string> {
  const out = new Map<number, string>();
  if (poolDef.valueTableName) {
    const vt = db.valueTables.find(t => t.name === poolDef.valueTableName);
    if (vt) {
      vt.entries.forEach((label, raw) => out.set(raw, label));
    }
  }
  poolDef.valueDescriptions.forEach((label, raw) => out.set(raw, label));
  return out;
}
