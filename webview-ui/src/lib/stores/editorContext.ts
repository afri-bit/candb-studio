import { writable } from 'svelte/store';

/** Backing `TextDocument.uri.toString()` for the active custom editor (set from `database.update`). */
export const documentUri = writable<string>('');
