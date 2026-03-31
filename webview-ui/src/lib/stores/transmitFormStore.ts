import { get, writable } from 'svelte/store';

/**
 * Persists Signal Lab transmit UI across tab switches (Transmit panel unmounts when another tab is active).
 */
export interface TransmitFormState {
    filterText: string;
    selectedMessageId: number | null;
    /** Last edited payload per CAN message id (bytes, length = DLC). */
    payloadByMessageId: Record<number, number[]>;
    intervalValue: number;
    intervalUnit: 's' | 'ms';
}

const state = writable<TransmitFormState>({
    filterText: '',
    selectedMessageId: null,
    payloadByMessageId: {},
    intervalValue: 0.1,
    intervalUnit: 's',
});

export const transmitFormStore = {
    subscribe: state.subscribe,

    setFilterText(filterText: string): void {
        state.update((s) => ({ ...s, filterText }));
    },

    setSelectedMessageId(selectedMessageId: number | null): void {
        state.update((s) => ({ ...s, selectedMessageId }));
    },

    /** Payload for editing; zeros if never set or DLC mismatch. */
    getPayload(messageId: number, dlc: number): number[] {
        const s = get(state);
        const existing = s.payloadByMessageId[messageId];
        if (existing && existing.length === dlc) {
            return [...existing];
        }
        return Array.from({ length: dlc }, () => 0);
    },

    setPayload(messageId: number, bytes: number[]): void {
        state.update((s) => ({
            ...s,
            payloadByMessageId: { ...s.payloadByMessageId, [messageId]: [...bytes] },
        }));
    },

    setInterval(intervalValue: number, intervalUnit: 's' | 'ms'): void {
        state.update((s) => ({ ...s, intervalValue, intervalUnit }));
    },
};
