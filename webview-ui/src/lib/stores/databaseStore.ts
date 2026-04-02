import { writable } from 'svelte/store';
import type {
  AttributeDescriptor,
  CanDatabaseDescriptor,
  MessageDescriptor,
  NodeDescriptor,
} from '../types';

const emptyDatabase: CanDatabaseDescriptor = {
  version: '',
  nodes: [],
  messages: [],
  signalPool: [],
  attributes: [],
  environmentVariables: [],
  valueTables: [],
};

function createDatabaseStore() {
  const { subscribe, set, update } = writable<CanDatabaseDescriptor>(emptyDatabase);

  return {
    subscribe,

    setDatabase(db: CanDatabaseDescriptor) {
      set(db);
    },

    reset() {
      set(emptyDatabase);
    },

    /* ── Message mutations ── */

    addMessage(message: MessageDescriptor) {
      update((db) => ({
        ...db,
        messages: [...db.messages, message],
      }));
    },

    updateMessage(index: number, message: MessageDescriptor) {
      update((db) => {
        const messages = [...db.messages];
        messages[index] = message;
        return { ...db, messages };
      });
    },

    removeMessage(index: number) {
      update((db) => ({
        ...db,
        messages: db.messages.filter((_, i) => i !== index),
      }));
    },

    /* ── Node mutations ── */

    addNode(node: NodeDescriptor) {
      update((db) => ({
        ...db,
        nodes: [...db.nodes, node],
      }));
    },

    updateNode(index: number, node: NodeDescriptor) {
      update((db) => {
        const nodes = [...db.nodes];
        nodes[index] = node;
        return { ...db, nodes };
      });
    },

    removeNode(index: number) {
      update((db) => ({
        ...db,
        nodes: db.nodes.filter((_, i) => i !== index),
      }));
    },

    /* ── Attribute mutations ── */

    addAttribute(attr: AttributeDescriptor) {
      update((db) => ({
        ...db,
        attributes: [...db.attributes, attr],
      }));
    },

    updateAttribute(index: number, attr: AttributeDescriptor) {
      update((db) => {
        const attributes = [...db.attributes];
        attributes[index] = attr;
        return { ...db, attributes };
      });
    },

    removeAttribute(index: number) {
      update((db) => ({
        ...db,
        attributes: db.attributes.filter((_, i) => i !== index),
      }));
    },
  };
}

export const databaseStore = createDatabaseStore();
