<script lang="ts">
  /**
   * Static layout: DBC messages with live values, split into Received (Rx) and Transmitted (Tx) echo lists.
   */
  import type { MessageDescriptor, SignalDescriptor } from '../../types';
  import {
    liveLatestByMessageId,
    monitorStore,
    type LiveMessageSnapshotWithDirection,
  } from '../../stores/monitorStore';

  interface Props {
    messages: MessageDescriptor[];
    filterText: string;
  }

  let { messages, filterText }: Props = $props();

  function formatUnixMs(ts: number): string {
    return String(Math.round(ts));
  }

  function formatValue(physical: number, valueType: SignalDescriptor['valueType']): string {
    if (valueType === 'integer') {
      return Number.isInteger(physical) ? String(physical) : physical.toFixed(2);
    }
    return physical.toFixed(4).replace(/\.?0+$/, '');
  }

  let definedIds = $derived(new Set(messages.map((m) => m.id)));

  let filteredMessages = $derived.by(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return [...messages].sort((a, b) => a.id - b.id);
    return messages
      .filter((m) => {
        if (m.name.toLowerCase().includes(q)) return true;
        if (m.id.toString(16).includes(q)) return true;
        if (m.id.toString().includes(q)) return true;
        return m.signals.some((s) => s.name.toLowerCase().includes(q));
      })
      .sort((a, b) => a.id - b.id);
  });

  function unknownLatest(
    live: Record<number, LiveMessageSnapshotWithDirection>,
  ): Array<{ id: number; snap: LiveMessageSnapshotWithDirection }> {
    const q = filterText.trim().toLowerCase();
    const out: Array<{ id: number; snap: LiveMessageSnapshotWithDirection }> = [];
    for (const idStr of Object.keys(live)) {
      const id = Number(idStr);
      if (definedIds.has(id)) continue;
      const snap = live[id];
      if (!snap) continue;
      if (q) {
        const hay = `${snap.messageName} ${id.toString(16)} ${id}`;
        if (!hay.toLowerCase().includes(q)) continue;
      }
      out.push({ id, snap });
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  let unknownLive = $derived(unknownLatest($liveLatestByMessageId));
</script>

<div class="static-root">
  <div class="static-hint">
    Values update when decoded frames arrive. Each message shows the <strong>latest</strong> snapshot,
    whether the frame was received from the bus (<strong>Rx</strong>) or echoed from a transmit
    (<strong>Tx</strong>).
    {#if !$monitorStore.isRunning}
      <span class="static-warn">Start monitoring to receive updates.</span>
    {/if}
  </div>

  <div class="static-scroll">
    <h3 class="section-label">DBC messages (live)</h3>
    {#each filteredMessages as msg (`live-${msg.id}`)}
      {@const live = $liveLatestByMessageId[msg.id]}
      <details class="msg-block" class:msg-block--tx={live?.lastDirection === 'tx'}>
        <summary class="msg-summary">
          <span class="msg-title">{msg.name}</span>
          <span class="msg-meta"
            >0x{msg.id.toString(16).toUpperCase().padStart(3, '0')} · DLC {msg.dlc}</span
          >
          {#if live}
            <span class="msg-dir" title="Direction of the latest frame for this ID"
              >{live.lastDirection === 'rx' ? 'Rx' : 'Tx'}</span
            >
            <span class="msg-live" title="Host time when the frame was processed (Unix ms)"
              >{formatUnixMs(live.timestamp)}</span
            >
          {:else}
            <span class="msg-live none">—</span>
          {/if}
        </summary>
        <div class="msg-body">
          <table class="sig-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Raw</th>
              </tr>
            </thead>
            <tbody>
              {#each msg.signals as sig (sig.name)}
                {@const row = live?.signals[sig.name]}
                <tr class:stale={!row}>
                  <td class="sig-name">{sig.name}</td>
                  <td class="sig-val">
                    {#if row}
                      {formatValue(row.physicalValue, sig.valueType)}
                    {:else}
                      —
                    {/if}
                  </td>
                  <td class="sig-unit">{sig.unit || row?.unit || ''}</td>
                  <td class="sig-raw"
                    >{#if row}{Number.isInteger(row.rawValue)
                        ? String(row.rawValue)
                        : row.rawValue.toFixed(2)}{:else}—{/if}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
          {#if live}
            <div class="payload-row">
              <span class="payload-label">Payload</span>
              <code class="payload-hex">{live.dataHex}</code>
            </div>
          {/if}
        </div>
      </details>
    {/each}

    {#if unknownLive.length > 0}
      <div class="unknown-section">
        <h4 class="unknown-title">Frames not in database</h4>
        {#each unknownLive as { id, snap } (id)}
          <details class="msg-block unknown" class:msg-block--tx={snap.lastDirection === 'tx'}>
            <summary class="msg-summary">
              <span class="msg-title">{snap.messageName}</span>
              <span class="msg-meta"
                >0x{id.toString(16).toUpperCase().padStart(3, '0')} · DLC {snap.dlc}</span
              >
              <span class="msg-dir" title="Direction of the latest frame for this ID"
                >{snap.lastDirection === 'rx' ? 'Rx' : 'Tx'}</span
              >
              <span class="msg-live" title="Host time when the frame was processed (Unix ms)"
                >{formatUnixMs(snap.timestamp)}</span
              >
            </summary>
            <div class="msg-body">
              <div class="payload-row">
                <span class="payload-label">Payload</span>
                <code class="payload-hex">{snap.dataHex}</code>
              </div>
              {#if Object.keys(snap.signals).length > 0}
                <table class="sig-table">
                  <thead>
                    <tr>
                      <th>Signal</th>
                      <th>Value</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each Object.entries(snap.signals) as [name, sig] (name)}
                      <tr>
                        <td class="sig-name">{name}</td>
                        <td class="sig-val">{sig.physicalValue.toFixed(4)}</td>
                        <td class="sig-unit">{sig.unit}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          </details>
        {/each}
      </div>
    {/if}

    {#if filteredMessages.length === 0 && unknownLive.length === 0}
      <div class="empty-static">
        {filterText.trim().length > 0
          ? 'No messages match the filter.'
          : 'No messages in the active database.'}
      </div>
    {/if}
  </div>
</div>

<style>
  .static-root {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    gap: 8px;
  }

  .static-hint {
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    line-height: 1.35;
    flex-shrink: 0;
  }

  .static-warn {
    display: block;
    margin-top: 6px;
    color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
    font-weight: 500;
  }

  .static-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    margin: 12px 0 4px 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
  }

  .section-label:first-child {
    margin-top: 0;
  }

  .msg-block {
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 6px;
    background: var(--vscode-editor-background);
  }

  .msg-block--tx {
    background: color-mix(
      in srgb,
      var(--vscode-charts-orange, #d18616) 6%,
      var(--vscode-editor-background)
    );
  }

  .msg-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 8px 10px;
    cursor: pointer;
    list-style: none;
    font-size: 0.9em;
  }

  .msg-summary::-webkit-details-marker {
    display: none;
  }

  .msg-summary::before {
    content: '▸';
    display: inline-block;
    width: 1em;
    transition: transform 0.12s ease;
    color: var(--vscode-descriptionForeground);
  }

  .msg-block[open] .msg-summary::before {
    transform: rotate(90deg);
  }

  .msg-title {
    font-weight: 600;
  }

  .msg-meta {
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.88em;
  }

  .msg-live {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }

  .msg-live.none {
    opacity: 0.6;
  }

  .msg-dir {
    font-size: 0.78rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--vscode-badge-background) 55%, transparent);
    color: var(--vscode-badge-foreground, var(--vscode-foreground));
  }

  .msg-body {
    padding: 0 10px 10px;
    border-top: 1px solid color-mix(in srgb, var(--vscode-widget-border) 70%, transparent);
  }

  .sig-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85em;
    margin-top: 8px;
  }

  .sig-table th {
    text-align: left;
    color: var(--vscode-descriptionForeground);
    font-weight: 600;
    padding: 4px 8px 4px 0;
    border-bottom: 1px solid var(--vscode-widget-border, #444);
  }

  .sig-table td {
    padding: 4px 8px 4px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 45%, transparent);
  }

  .sig-table tr.stale .sig-name {
    opacity: 0.75;
  }

  .sig-name {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .sig-val {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .sig-unit,
  .sig-raw {
    color: var(--vscode-descriptionForeground);
    font-size: 0.92em;
  }

  .payload-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.85em;
  }

  .payload-label {
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
    padding-top: 2px;
  }

  .payload-hex {
    flex: 1;
    min-width: 0;
    word-break: break-all;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.88em;
  }

  .unknown-section {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed var(--vscode-widget-border, #444);
  }

  .unknown-title {
    margin: 0 0 8px 0;
    font-size: 0.88em;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
  }

  .msg-block.unknown {
    background: color-mix(
      in srgb,
      var(--vscode-editor-inactiveSelectionBackground) 35%,
      var(--vscode-editor-background)
    );
  }

  .empty-static {
    padding: 32px 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 0.92em;
  }
</style>
