<script lang="ts">
  import { get } from 'svelte/store';
  import type { SignalDescriptor } from '../../types';
  import { vscode } from '../../vscode';
  import { documentUri } from '../../stores/editorContext';
  let { signal, messageId }: { signal: SignalDescriptor; messageId: number } = $props();
  function update(value: 'none' | 'multiplexor' | number) {
    const uri = get(documentUri);
    if (!uri || (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))) return;
    vscode.postMessage({
      type: 'updateSignal',
      payload: {
        documentUri: uri,
        messageId,
        signalName: signal.name,
        changes: { multiplex: value },
      },
    });
  }
</script>

<div class="mux-editor">
  <select
    aria-label="Multiplex role for {signal.name}"
    value={typeof signal.multiplex === 'number' ? 'branch' : signal.multiplex}
    onchange={(e) =>
      update(
        e.currentTarget.value === 'branch' ? 0 : (e.currentTarget.value as 'none' | 'multiplexor'),
      )}
  >
    <option value="none">Always present</option><option value="multiplexor">Selector (M)</option
    ><option value="branch">Multiplexed (mN)</option>
  </select>
  {#if typeof signal.multiplex === 'number'}
    <input
      aria-label="Raw multiplex value for {signal.name}"
      type="number"
      min="0"
      step="1"
      max={Number.MAX_SAFE_INTEGER}
      value={signal.multiplex}
      onchange={(e) => {
        if (e.currentTarget.value !== '' && e.currentTarget.validity.valid)
          update(Number(e.currentTarget.value));
      }}
    />
  {/if}
</div>

<style>
  .mux-editor {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  select,
  input {
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #555);
    padding: 4px;
  }
  input {
    width: 80px;
  }
</style>
