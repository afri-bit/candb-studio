<script lang="ts">
  import { get } from 'svelte/store';
  import type { MessageDescriptor, NetworkFolderDescriptor } from '../../types';
  import {
    scheduleErrors,
    type MessageSchedule,
  } from '../../../../../src/core/models/database/messageSchedule';
  import { vscode } from '../../vscode';
  import { documentUri } from '../../stores/editorContext';

  let { message, folder }: { message: MessageDescriptor; folder?: NetworkFolderDescriptor } =
    $props();
  let draft = $state<MessageSchedule>({
    sendType: '',
    cycleTimeMs: 0,
    sourceNetwork: '',
    forwardNetwork: '',
    forwardNode: '',
    forwardRateMode: 'source',
    forwardFrequencyHz: 0,
  });
  $effect(() => {
    const next: MessageSchedule = {
      sendType: '',
      cycleTimeMs: 0,
      sourceNetwork: '',
      forwardNetwork: '',
      forwardNode: '',
      forwardRateMode: 'source',
      forwardFrequencyHz: 0,
      ...message.schedule,
    };
    if (folder?.enabled && folder.currentNetwork) next.sourceNetwork = folder.currentNetwork;
    draft = next;
  });
  let errors = $derived(scheduleErrors(draft));
  function save() {
    const uri = get(documentUri);
    if (!uri || errors.length) return;
    vscode.postMessage({
      type: 'updateMessage',
      payload: { documentUri: uri, messageId: message.id, changes: { schedule: { ...draft } } },
    });
  }
</script>

<section class="schedule">
  <h3>Transmission schedule</h3>
  <label
    >Send type (required)
    <select bind:value={draft.sendType} required>
      <option value="" disabled>Choose send type…</option>
      <option value="cyclic">Cyclic</option><option value="trigger">Trigger</option>
    </select>
  </label>
  {#if draft.sendType === 'cyclic'}
    <label
      >Cycle time [ms] (required)
      <input type="number" min="0.000001" step="any" bind:value={draft.cycleTimeMs} required />
    </label>
    <label
      >Frequency [Hz]
      <input
        type="number"
        min="0.000001"
        step="any"
        value={draft.cycleTimeMs > 0 ? 1000 / draft.cycleTimeMs : ''}
        onchange={(e) => {
          const hz = Number(e.currentTarget.value);
          if (Number.isFinite(hz) && hz > 0) draft.cycleTimeMs = 1000 / hz;
        }}
      />
    </label>
  {:else if draft.sendType === 'trigger'}
    <p>
      Triggered messages have no required cycle time. Enter an estimated event rate in Bus load to
      include them in a load scenario.
    </p>
  {/if}
  <h3>Forwarding</h3>
  {#if !folder?.enabled}
    <p>
      Select a folder containing this file and at least one other DBC to enable forwarding. Existing
      routing attributes are preserved.
    </p>
  {/if}
  <fieldset disabled={!folder?.enabled}>
    <label
      >Source network <input
        value={folder?.currentNetwork ?? draft.sourceNetwork}
        readonly
      /></label
    >
    <label
      >Destination network
      <select bind:value={draft.forwardNetwork}>
        <option value="">Not forwarded</option>
        {#if draft.forwardNetwork && !folder?.databases.some((d) => d.network === draft.forwardNetwork)}
          <option value={draft.forwardNetwork}>{draft.forwardNetwork} (unavailable)</option>
        {/if}
        {#each folder?.databases.filter((d) => d.network !== folder.currentNetwork) ?? [] as d}
          <option value={d.network}>{d.network}</option>
        {/each}
      </select>
    </label>
    {#if draft.forwardNetwork}
      <label
        >Forwarding node (required) <input
          bind:value={draft.forwardNode}
          required
          placeholder="Gateway ECU"
        /></label
      >
      <label
        >Forwarding rate
        <select bind:value={draft.forwardRateMode}>
          <option value="source">Same as source message</option><option value="derated"
            >Derated by forwarding node</option
          >
        </select>
      </label>
      {#if draft.forwardRateMode === 'derated'}
        <label
          >Forward frequency [Hz] (required) <input
            type="number"
            min="0.000001"
            step="any"
            bind:value={draft.forwardFrequencyHz}
            required
          /></label
        >
      {/if}
    {/if}
  </fieldset>
  {#each errors as error}<p class="error">{error}</p>{/each}
  <button onclick={save} disabled={errors.length > 0}>Apply schedule</button>
</section>

<style>
  .schedule {
    padding: 12px 0;
    max-width: 620px;
  }
  h3 {
    font-size: 13px;
    margin: 14px 0 10px;
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 10px 0;
  }
  input,
  select {
    width: 240px;
    padding: 5px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #555);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  fieldset:disabled {
    opacity: 0.6;
  }
  p {
    line-height: 1.5;
    opacity: 0.85;
  }
  .error {
    color: var(--vscode-errorForeground, #f88);
  }
  button {
    padding: 6px 12px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: 0;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
