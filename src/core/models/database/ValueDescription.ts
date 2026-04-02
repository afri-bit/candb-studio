/**
 * Human-readable enumeration labels for a signal's raw numeric values.
 *
 * For example, a signal "GearPosition" might map 0 → "Park", 1 → "Reverse",
 * 2 → "Neutral", 3 → "Drive". In a DBC file these appear in the `VAL_`
 * section.
 */
export class ValueDescription {
    public messageId: number;
    public signalName: string;
    public descriptions: Map<number, string>;

    constructor(messageId: number, signalName: string, descriptions?: Map<number, string>) {
        this.messageId = messageId;
        this.signalName = signalName;
        this.descriptions = descriptions ?? new Map();
    }

    /** Add or update a value-label pair. */
    set(value: number, description: string): void {
        this.descriptions.set(value, description);
    }

    /** Get the label for a given numeric value, or `undefined` if unmapped. */
    get(value: number): string | undefined {
        return this.descriptions.get(value);
    }

    get size(): number {
        return this.descriptions.size;
    }
}
