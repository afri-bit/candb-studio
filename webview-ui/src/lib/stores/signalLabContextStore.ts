import { writable } from 'svelte/store';

export type ConnectionMode = 'disconnected' | 'virtual_simulation' | 'hardware';

/** Host-pushed Signal Lab bus context (subset of `signalLab.context`). */
export const signalLabContextStore = writable<{
  connectionMode: ConnectionMode;
  virtualSimulationRunning: boolean;
}>({
  connectionMode: 'disconnected',
  virtualSimulationRunning: false,
});
