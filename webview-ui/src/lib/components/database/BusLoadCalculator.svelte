<script lang="ts">
  import type { MessageDescriptor, NetworkFolderDescriptor } from '../../types';
  import { CAN_BITRATES, calculateBusLoad } from '../../../../../src/core/services/busLoad';
  let {
    messages,
    folder,
    triggerRates = $bindable({}),
  }: {
    messages: MessageDescriptor[];
    folder?: NetworkFolderDescriptor;
    triggerRates?: Record<string, number>;
  } = $props();
  let bitrate = $state<number>(500000);
  let model = $derived.by(() => {
    const groups = folder?.enabled
      ? folder.databases
      : [{ network: folder?.currentNetwork || 'Current DBC', uri: '', messages }];
    return groups.flatMap((d) =>
      d.messages.map((m) => ({
        ...m,
        key: `${folder?.path ?? 'single'}:${d.network}:${m.id}`,
        name: `${d.network} / ${m.name}`,
        schedule: m.schedule
          ? {
              ...m.schedule,
              sourceNetwork: d.network,
              forwardNetwork: folder?.enabled ? m.schedule.forwardNetwork : '',
            }
          : undefined,
      })),
    );
  });
  let result = $derived(calculateBusLoad(model, triggerRates));
  let triggers = $derived(model.filter((m) => m.schedule?.sendType === 'trigger'));
  let missingRoutes = $derived(
    model.filter(
      (m) =>
        m.schedule?.forwardNetwork &&
        !folder?.databases.some((d) => d.network === m.schedule?.forwardNetwork),
    ),
  );
  let visibleResult = $derived(
    calculateBusLoad(
      model.map((m) =>
        missingRoutes.includes(m) ? { ...m, schedule: { ...m.schedule!, forwardNetwork: '' } } : m,
      ),
      triggerRates,
    ),
  );
  function percent(bits: number, rate: number) {
    return ((100 * bits) / rate).toFixed(2) + '%';
  }
</script>

<section class="calculator dbc-card">
  <h2>Bus load</h2>
  <p>
    Classical CAN data frames, including frame overhead and 3-bit intermission. Compare unstuffed
    load with a conservative worst-case stuffing bound. Errors, retransmissions and arbitration
    latency are not modelled. CAN FD is excluded.
  </p>
  {#if !folder?.enabled}<p>
      Single-file calculation. Select a folder with at least two DBC files to include forwarded
      traffic.
    </p>{/if}
  <label
    >Detail bitrate
    <select bind:value={bitrate}
      >{#each CAN_BITRATES as rate}<option value={rate}>{rate / 1000} kbit/s</option>{/each}</select
    >
  </label>
  {#if triggers.length}
    <details open>
      <summary>Triggered message rate estimates (scenario only, not saved to DBC)</summary>
      {#each triggers as m}<label
          >{m.name} [events/s]
          <input
            type="number"
            min="0"
            step="any"
            value={triggerRates[m.key] ?? ''}
            oninput={(e) => (triggerRates[m.key] = Number(e.currentTarget.value))}
          /></label
        >{/each}
    </details>
  {/if}
  {#if result.excluded.length || missingRoutes.length}
    <div class="warning">
      <strong>Partial load: excluded traffic</strong>
      <ul>
        {#each result.excluded as reason}<li>{reason}</li>{/each}{#each missingRoutes as m}<li>
            {m.name}: destination DBC is not in this folder; forwarded traffic excluded.
          </li>{/each}
      </ul>
    </div>
  {/if}
  {#if visibleResult.networks.length === 0}<p>
      No configured traffic. Set message send types and cycle times under Messages → Definition.
    </p>{/if}
  {#each visibleResult.networks as network}
    <h3>{network.network} · {network.framesPerSecond.toFixed(2)} frames/s</h3>
    <table>
      <thead><tr><th>Bitrate</th><th>Unstuffed load</th><th>Worst-case bound</th></tr></thead><tbody
      >
        {#each CAN_BITRATES as rate}<tr class:overloaded={network.worstBitsPerSecond > rate}
            ><td>{rate / 1000} kbit/s</td><td>{percent(network.baseBitsPerSecond, rate)}</td><td
              >{percent(network.worstBitsPerSecond, rate)}{network.worstBitsPerSecond > rate
                ? ' · over capacity'
                : ''}</td
            ></tr
          >{/each}
      </tbody>
    </table>
  {/each}
  {#if visibleResult.contributions.length}
    <h3>Traffic contributions at {bitrate / 1000} kbit/s</h3>
    <table>
      <thead
        ><tr
          ><th>Message</th><th>Network</th><th>Traffic</th><th>Hz</th><th>Unstuffed</th><th
            >Worst-case</th
          ></tr
        ></thead
      ><tbody>
        {#each visibleResult.contributions as row}<tr
            ><td>{row.message}</td><td>{row.network}</td><td
              >{row.forwarded ? 'Forwarded' : 'Source'}</td
            ><td>{row.frequencyHz.toFixed(2)}</td><td>{percent(row.baseBitsPerSecond, bitrate)}</td
            ><td>{percent(row.worstBitsPerSecond, bitrate)}</td></tr
          >{/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .calculator {
    overflow: auto;
    padding: 20px;
  }
  h2 {
    margin-top: 0;
  }
  p {
    max-width: 950px;
    line-height: 1.6;
  }
  label {
    display: flex;
    gap: 16px;
    align-items: center;
    margin: 12px 0;
  }
  input,
  select {
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #555);
    padding: 5px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0 24px;
  }
  th,
  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, #555);
    text-align: left;
  }
  th {
    font-weight: 600;
  }
  .warning,
  .overloaded {
    color: var(--vscode-editorWarning-foreground, #e9b44c);
  }
  details {
    margin: 16px 0;
  }
  summary {
    cursor: pointer;
  }
</style>
