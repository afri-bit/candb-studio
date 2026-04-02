<script lang="ts">
  /**
   * A single row in the CAN monitor table, showing one decoded frame.
   */
  import type { DecodedFrameDescriptor } from '../../types';
  import SignalValueDisplay from './SignalValueDisplay.svelte';

  interface Props {
    decoded: DecodedFrameDescriptor;
  }

  let { decoded }: Props = $props();

  /** Wall-clock time — avoids huge epoch strings overlapping the ID column. */
  function formatTime(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${h}:${min}:${s}.${ms}`;
  }

  let timeStr = $derived(formatTime(decoded.frame.timestamp));

  let idHex = $derived(
    `0x${decoded.frame.id
      .toString(16)
      .toUpperCase()
      .padStart(decoded.frame.isExtended ? 8 : 3, '0')}`,
  );
</script>

<div class="frame-row monitor-table-grid">
  <span class="col-time" title="Unix ms: {String(Math.round(decoded.frame.timestamp))}"
    >{timeStr}</span
  >
  <span
    class="col-dir"
    class:col-dir--tx={decoded.direction === 'tx'}
    title={decoded.direction === 'tx' ? 'Transmit echo' : 'Received'}
    >{decoded.direction === 'tx' ? 'Tx' : 'Rx'}</span
  >
  <span class="col-id">{idHex}</span>
  <span class="col-name">{decoded.messageName}</span>
  <span class="col-dlc">{decoded.frame.dlc}</span>
  <span class="col-data"
    >{decoded.frame.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}</span
  >
  <span class="col-signals">
    {#each decoded.signals as sig}
      <SignalValueDisplay signal={sig} />
    {/each}
  </span>
</div>

<style>
  /* Keep in sync with MonitorPanel `.table-header` grid */
  .monitor-table-grid {
    display: grid;
    grid-template-columns:
      11.5ch
      2.25rem
      minmax(4.5rem, 5.5rem)
      minmax(5rem, 9rem)
      2.25rem
      minmax(9rem, 14rem)
      minmax(0, 1fr);
    column-gap: 10px;
    align-items: start;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, #222);
  }

  .frame-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .col-time {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    min-width: 0;
  }

  .col-dir {
    font-size: 0.78em;
    font-weight: 700;
    text-align: center;
    color: var(--vscode-charts-blue);
  }

  .col-dir--tx {
    color: var(--vscode-charts-orange, #d18616);
  }

  .col-id {
    color: var(--vscode-charts-blue);
    white-space: nowrap;
    min-width: 0;
  }

  .col-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .col-dlc {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .col-data {
    letter-spacing: 0.35px;
    word-break: break-all;
    min-width: 0;
  }

  .col-signals {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }
</style>
