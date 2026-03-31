import { writable, derived } from 'svelte/store';
import type { CanBusState } from '../types';

interface ConnectionState {
    state: CanBusState;
    adapterType: string | undefined;
}

function createConnectionStore() {
    const { subscribe, set } = writable<ConnectionState>({
        state: 'disconnected',
        adapterType: undefined,
    });

    return {
        subscribe,

        setState(state: CanBusState, adapterType?: string) {
            set({ state, adapterType });
        },

        reset() {
            set({ state: 'disconnected', adapterType: undefined });
        },
    };
}

export const connectionStore = createConnectionStore();

export const isConnected = derived(connectionStore, ($conn) => $conn.state === 'connected');
