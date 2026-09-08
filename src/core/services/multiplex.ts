export interface MultiplexSignal {
    name: string;
    multiplex: 'none' | 'multiplexor' | number;
    bitLength: number;
    isSigned: boolean;
    valueType: string;
}

/** Only distinct branches of a valid single selector are mutually exclusive. */
export function multiplexSignalsCanCoexist(
    a: MultiplexSignal,
    b: MultiplexSignal,
    signals: MultiplexSignal[],
): boolean {
    const selectors = signals.filter((s) => s.multiplex === 'multiplexor');
    if (selectors.length !== 1 || multiplexErrors(signals).length) {
        return true;
    }
    return !(
        typeof a.multiplex === 'number' &&
        typeof b.multiplex === 'number' &&
        a.multiplex !== b.multiplex
    );
}

export function multiplexErrors(signals: MultiplexSignal[]): string[] {
    const selectors = signals.filter((s) => s.multiplex === 'multiplexor');
    const branches = signals.filter((s) => typeof s.multiplex === 'number');
    const errors: string[] = [];
    if (selectors.length > 1) {
        errors.push('Basic multiplexing requires exactly one selector per message.');
    }
    if (branches.length && !selectors.length) {
        errors.push('Multiplexed signals require a selector (M) in this message.');
    }
    for (const s of selectors) {
        if (s.isSigned || s.valueType !== 'integer' || s.bitLength < 1 || s.bitLength > 53) {
            errors.push(`Selector ${s.name} must be an unsigned integer of 1–53 bits.`);
        }
    }
    for (const s of branches) {
        const value = s.multiplex as number;
        if (
            !Number.isSafeInteger(value) ||
            value < 0 ||
            (selectors.length === 1 && value >= 2 ** selectors[0].bitLength)
        ) {
            errors.push(`Signal ${s.name} has a multiplex value outside the selector's raw range.`);
        }
    }
    return errors;
}
