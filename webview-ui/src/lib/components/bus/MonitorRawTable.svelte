<script lang="ts">
  /**
   * Static table: one row per CAN ID; DLC and payload cells overwrite when a new frame arrives.
   * Separate instances for Rx (bus receive) vs Tx (transmit echo / loopback).
   */
  import { monitorStore, type LiveMessageSnapshot } from '../../stores/monitorStore';

  interface Props {
    filterText: string;
    /** Which snapshot map to show. */
    which: 'rx' | 'tx';
    /** When true, show no-DBC hints (split between Rx and Tx). */
    noDatabaseHint?: boolean;
  }

  let { filterText, which, noDatabaseHint = false }: Props = $props();

  function formatId(id: number, ext: boolean): string {
    const w = ext ? 8 : 3;
    return `0x${id.toString(16).toUpperCase().padStart(w, '0')}`;
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${h}:${min}:${s}.${ms}`;
  }

  let rows = $derived.by((): Array<{ id: number; snap: LiveMessageSnapshot }> => {
    const q = filterText.trim().toLowerCase();
    const live = which === 'rx' ? $monitorStore.liveRxByMessageId : $monitorStore.liveTxByMessageId;
    const out: Array<{ id: number; snap: LiveMessageSnapshot }> = [];
    for (const idStr of Object.keys(live)) {
      const id = Number(idStr);
      const snap = live[id];
      if (!snap) continue;
      if (q) {
        const hex = id.toString(16);
        const hay = `${hex} 0x${hex} ${id} ${snap.messageName}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push({ id, snap });
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  });
</script>

<div class="raw-root">
  {#if noDatabaseHint && which === 'rx'}
    <p class="raw-hint">
      Raw traffic only — no DBC required. Connect, start monitoring, and confirm IDs and payloads.
      Load a CAN database in the ribbon when you want decoded signals and names.
    </p>
  {:else if noDatabaseHint && which === 'tx'}
    <p class="raw-hint raw-hint--tx">
      Transmit path: frames you send, echoed back on the bus (loopback). Pure receive traffic is
      under <strong>Rx</strong>.
    </p>
  {:else}
    <p class="raw-hint">
      Latest {which === 'rx' ? 'received' : 'transmit echo'} payload per CAN ID updates in place.
    </p>
  {/if}

  <div
    class="raw-table"
    role="table"
    aria-label={which === 'rx' ? 'Received CAN frames' : 'Transmitted echo frames'}
  >
    <div class="raw-head" role="row">
      <span class="cell id" role="columnheader">ID</span>
      <span class="cell ext" role="columnheader">Bus</span>
      <span class="cell dlc" role="columnheader">DLC</span>
      <span class="cell data" role="columnheader">Data</span>
      <span class="cell time" role="columnheader">Last seen</span>
    </div>
    <div class="raw-body">
      {#each rows as { id, snap } (id)}
        <div class="raw-row" role="row">
          <span class="cell id mono" title="CAN identifier">{formatId(id, snap.isExtended)}</span>
          <span class="cell ext" title={snap.isExtended ? 'Extended 29-bit' : 'Standard 11-bit'}
            >{snap.isExtended ? 'EXT' : 'STD'}</span
          >
          <span class="cell dlc"
            >{snap.dlc}{#if snap.isFd}&nbsp;<span class="badge-fd" title="CAN FD frame">FD</span>{/if}</span
          >
          <span class="cell data mono" title="Last payload">{snap.dataHex}</span>
          <span class="cell time">{formatTime(snap.timestamp)}</span>
        </div>
      {:else}
        <div class="raw-empty" role="status">
          {$monitorStore.isRunning ? 'Waiting for frames…' : 'Start monitoring from the ribbon.'}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .raw-root {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    gap: 10px;
  }

  .raw-hint {
    margin: 0;
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
    flex-shrink: 0;
  }

  .raw-hint--tx {
    opacity: 0.95;
  }

  .raw-table {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 6px;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }

  .raw-head {
    display: grid;
    grid-template-columns: minmax(5.5rem, 7rem) 2.75rem 2.25rem minmax(10rem, 1fr) 11.5ch;
    column-gap: 10px;
    align-items: center;
    padding: 8px 10px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-widget-border, #444);
    font-weight: 600;
    font-size: 0.82em;
  }

  .raw-body {
    flex: 1;
    overflow: auto;
    font-size: 0.85em;
  }

  .raw-row {
    display: grid;
    grid-template-columns: minmax(5.5rem, 7rem) 2.75rem 2.25rem minmax(10rem, 1fr) 11.5ch;
    column-gap: 10px;
    align-items: start;
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 45%, transparent);
  }

  .raw-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .raw-row:last-child {
    border-bottom: none;
  }

  .cell.id {
    color: var(--vscode-charts-blue);
    font-weight: 600;
  }

  .cell.ext {
    font-size: 0.88em;
    color: var(--vscode-descriptionForeground);
  }

  .cell.dlc {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .cell.data {
    letter-spacing: 0.35px;
    word-break: break-all;
    line-height: 1.35;
  }

  .cell.time {
    font-variant-numeric: tabular-nums;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .mono {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .raw-empty {
    padding: 28px 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 0.92em;
  }

  .badge-fd {
    display: inline-block;
    font-size: 0.72em;
    font-weight: 700;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
    color: var(--vscode-charts-blue);
    vertical-align: middle;
    letter-spacing: 0.03em;
  }
</style>
