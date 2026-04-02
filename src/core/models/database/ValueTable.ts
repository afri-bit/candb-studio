/**
 * Named enumeration (DBC `VAL_TABLE_`).
 *
 * Signals can reference a value table by name; per-signal overrides and
 * per-message `VAL_` lines are merged at resolve time.
 */
export class ValueTable {
    public name: string;
    public entries: Map<number, string>;
    /** Optional `CM_ VAL_TABLE_` comment (Vector DBC). */
    public comment?: string;

    constructor(name: string, entries?: Map<number, string>, comment?: string) {
        this.name = name;
        this.entries = entries ?? new Map();
        this.comment = comment;
    }

    set(value: number, description: string): void {
        this.entries.set(value, description);
    }
}
