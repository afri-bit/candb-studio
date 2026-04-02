<script lang="ts">
  /**
   * Bus database architecture: ECUs, frames, and signals as a flow diagram (Tx → message → Rx).
   * Describes the CAN data model in this DBC, not the VS Code extension.
   */
  import type { MessageDescriptor, NodeDescriptor, SignalDescriptor } from '../../types';

  interface Props {
    nodes: NodeDescriptor[];
    messages: MessageDescriptor[];
    signalPool: SignalDescriptor[];
    /** DBC version string from the file header, if any. */
    version?: string;
    onSelectMessage?: (messageId: number) => void;
    onSelectNode?: (nodeName: string) => void;
    onNavigateToSignal?: (messageId: number, signalName: string) => void;
  }

  let {
    nodes,
    messages,
    signalPool,
    version = '',
    onSelectMessage,
    onSelectNode,
    onNavigateToSignal,
  }: Props = $props();

  let sortedMessages = $derived([...messages].sort((a, b) => a.id - b.id));

  let nodeNameSet = $derived(new Set(nodes.map((n) => n.name)));

  function idHex(id: number): string {
    return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
  }

  function receiverNamesForMessage(m: MessageDescriptor): string[] {
    const set = new Set<string>();
    for (const s of m.signals) {
      for (const r of s.receivers ?? []) {
        const t = r.trim();
        if (t) set.add(t);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  type FlowRow = {
    message: MessageDescriptor;
    tx: string;
    txKnownNode: boolean;
    receivers: string[];
  };

  let flowRows = $derived.by((): FlowRow[] => {
    return sortedMessages.map((m) => {
      const raw = m.transmitter?.trim() ?? '';
      const tx = raw.length > 0 ? raw : '—';
      return {
        message: m,
        tx,
        txKnownNode: raw.length > 0 && nodeNameSet.has(raw),
        receivers: receiverNamesForMessage(m),
      };
    });
  });

  let linkedSignalNames = $derived.by(() => {
    const set = new Set<string>();
    for (const m of messages) {
      for (const s of m.signals) set.add(s.name);
    }
    return set;
  });

  let poolOnlySignals = $derived(
    signalPool
      .filter((s) => !linkedSignalNames.has(s.name))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let stats = $derived({
    nodeCount: nodes.length,
    frameCount: messages.length,
    onBusSignalCount: linkedSignalNames.size,
    poolOnlyCount: poolOnlySignals.length,
  });

  /** Nodes that never appear as transmitter or receiver (still in BU_). */
  let orphanNodes = $derived.by(() => {
    const tx = new Set<string>();
    const rx = new Set<string>();
    for (const m of messages) {
      const t = m.transmitter?.trim();
      if (t) tx.add(t);
      for (const s of m.signals) {
        for (const r of s.receivers ?? []) {
          const rr = r.trim();
          if (rr) rx.add(rr);
        }
      }
    }
    return nodes
      .map((n) => n.name)
      .filter((name) => !tx.has(name) && !rx.has(name))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  });

  function isReceiverKnownNode(name: string): boolean {
    return nodeNameSet.has(name);
  }
</script>

<div class="bus-arch">
  <header class="arch-intro">
    <h2 class="arch-title">Bus architecture{version ? ` · ${version}` : ''}</h2>
  </header>

  <section class="stats-strip" aria-label="Database summary">
    <div class="stat">
      <span class="stat-val">{stats.nodeCount}</span><span class="stat-lbl">ECUs (nodes)</span>
    </div>
    <div class="stat">
      <span class="stat-val">{stats.frameCount}</span><span class="stat-lbl">Frames</span>
    </div>
    <div class="stat">
      <span class="stat-val">{stats.onBusSignalCount}</span><span class="stat-lbl"
        >Signals on frames</span
      >
    </div>
    {#if stats.poolOnlyCount > 0}
      <div class="stat warn">
        <span class="stat-val">{stats.poolOnlyCount}</span><span class="stat-lbl"
          >Pool-only (not on a frame)</span
        >
      </div>
    {/if}
  </section>

  <div class="legend" aria-hidden="true">
    <span class="leg-item"><span class="leg-swatch tx"></span> Transmitter ECU</span>
    <span class="leg-item"><span class="leg-swatch frame"></span> Frame + signals</span>
    <span class="leg-item"><span class="leg-swatch rx"></span> Receiver ECU</span>
  </div>

  {#if messages.length === 0 && nodes.length === 0}
    <p class="empty-hint">
      No nodes or frames yet. Add ECUs and messages in the Nodes and Messages tabs to see the bus
      map.
    </p>
  {:else if messages.length === 0}
    <p class="empty-hint">
      No frames defined. Messages carry signals on the bus; add frames to map transmitters and
      receivers.
    </p>
  {:else}
    <div class="bus-spine" aria-hidden="true">
      <span class="spine-label">Data flow (logical)</span>
      <div class="spine-line"></div>
    </div>

    <div class="flow-list" role="list">
      {#each flowRows as row (row.message.id)}
        <div class="flow-block" role="listitem">
          <div class="flow-part tx-part">
            {#if row.tx === '—'}
              <div class="ecu-block muted" title="No BO_ transmitter set">
                <span class="ecu-role">Tx</span>
                <span class="ecu-name">Unassigned</span>
              </div>
            {:else}
              <button
                type="button"
                class="ecu-block"
                class:unknown={!row.txKnownNode}
                title={row.txKnownNode ? 'Open in Nodes' : 'Transmitter not in BU_ list'}
                onclick={() => onSelectNode?.(row.tx)}
              >
                <span class="ecu-role">Tx</span>
                <span class="ecu-name">{row.tx}</span>
              </button>
            {/if}
          </div>

          <div class="flow-arrow" aria-hidden="true">→</div>

          <div class="flow-part frame-part">
            <div class="frame-block">
              <button
                type="button"
                class="frame-head-btn"
                title="Open in Messages"
                onclick={() => onSelectMessage?.(row.message.id)}
              >
                <span class="frame-name">{row.message.name}</span>
                <span class="frame-meta">{idHex(row.message.id)} · DLC {row.message.dlc}</span>
              </button>
              {#if row.message.signals.length === 0}
                <p class="frame-empty">No signals mapped to this frame</p>
              {:else}
                <div class="signal-pills">
                  {#each row.message.signals as sig (sig.name)}
                    {#if onNavigateToSignal}
                      <button
                        type="button"
                        class="sig-pill"
                        title="Open signal in Signals tab"
                        onclick={() => onNavigateToSignal(row.message.id, sig.name)}
                      >
                        {sig.name}
                      </button>
                    {:else}
                      <span class="sig-pill static">{sig.name}</span>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <div class="flow-arrow" aria-hidden="true">→</div>

          <div class="flow-part rx-part">
            {#if row.receivers.length === 0}
              <div class="ecu-block muted" title="No SG_ receivers on this frame’s signals">
                <span class="ecu-role">Rx</span>
                <span class="ecu-name">—</span>
              </div>
            {:else}
              <div class="rx-stack">
                <span class="rx-label">Rx</span>
                <div class="rx-nodes">
                  {#each row.receivers as rname (rname)}
                    <button
                      type="button"
                      class="ecu-chip"
                      class:unknown={!isReceiverKnownNode(rname)}
                      title={isReceiverKnownNode(rname)
                        ? 'Open in Nodes'
                        : 'Receiver not in BU_ list'}
                      onclick={() => onSelectNode?.(rname)}
                    >
                      {rname}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if orphanNodes.length > 0}
    <section class="aside-block">
      <h3 class="aside-title">ECUs without Tx/Rx in this map</h3>
      <p class="aside-text">
        These <code>BU_</code> nodes are not used as a frame transmitter and never appear as a
        signal receiver:
        {orphanNodes.join(', ')}.
      </p>
    </section>
  {/if}

  {#if poolOnlySignals.length > 0}
    <section class="aside-block pool-block">
      <h3 class="aside-title">Signal pool (not placed on a frame)</h3>
      <p class="aside-text">
        Definitions exist in the pool but are not mapped to any <code>BO_</code> frame yet — they do not
        appear on the bus in this database.
      </p>
      <ul class="pool-list">
        {#each poolOnlySignals as ps (ps.name)}
          <li>{ps.name}</li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .bus-arch {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  .arch-intro {
    margin: 0;
  }

  .arch-title {
    margin: 0 0 8px 0;
    font-size: 15px;
    font-weight: 600;
  }

  .stats-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
    padding: 10px 12px;
    border-radius: var(--dbc-radius-sm, 6px);
    border: 1px solid var(--dbc-border, var(--vscode-panel-border));
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 92%,
      var(--vscode-sideBar-background)
    );
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 72px;
  }

  .stat.warn .stat-val {
    color: var(--vscode-editorWarning-foreground, #cca700);
  }

  .stat-val {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .stat-lbl {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 18px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .leg-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .leg-swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid var(--dbc-border, var(--vscode-panel-border));
  }

  .leg-swatch.tx {
    background: color-mix(in srgb, #3b82f6 35%, var(--vscode-editor-background));
  }

  .leg-swatch.frame {
    background: color-mix(in srgb, var(--vscode-focusBorder) 25%, var(--vscode-editor-background));
  }

  .leg-swatch.rx {
    background: color-mix(in srgb, #10b981 30%, var(--vscode-editor-background));
  }

  .empty-hint {
    margin: 0;
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
  }

  .bus-spine {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: -4px;
  }

  .spine-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .spine-line {
    flex: 1;
    height: 2px;
    border-radius: 1px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, #3b82f6 50%, transparent),
      color-mix(in srgb, var(--vscode-focusBorder) 60%, transparent),
      color-mix(in srgb, #10b981 50%, transparent)
    );
  }

  .flow-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .flow-block {
    display: grid;
    grid-template-columns: minmax(100px, 140px) auto minmax(180px, 1fr) auto minmax(120px, 200px);
    align-items: stretch;
    gap: 6px 8px;
  }

  @media (max-width: 900px) {
    .flow-block {
      grid-template-columns: 1fr;
    }

    .flow-arrow {
      display: none;
    }

    .flow-part.tx-part {
      border-bottom: 1px dashed color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
      padding-bottom: 8px;
    }

    .flow-part.frame-part {
      padding-block: 4px;
    }
  }

  .flow-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
    font-size: 16px;
    font-weight: 600;
    user-select: none;
  }

  .flow-part {
    min-width: 0;
  }

  .ecu-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    width: 100%;
    height: 100%;
    min-height: 72px;
    padding: 10px 12px;
    border-radius: var(--dbc-radius-sm, 6px);
    border: 1px solid var(--dbc-border, var(--vscode-panel-border));
    background: color-mix(in srgb, #3b82f6 12%, var(--vscode-editor-background));
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
  }

  .ecu-block.muted {
    cursor: default;
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 94%,
      var(--vscode-input-background)
    );
    color: var(--vscode-descriptionForeground);
  }

  .ecu-block.unknown:not(.muted) {
    border-style: dashed;
  }

  .ecu-block:hover:not(.muted) {
    border-color: var(--vscode-focusBorder);
  }

  .ecu-role {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
  }

  .ecu-name {
    font-size: 13px;
    font-weight: 600;
    word-break: break-word;
  }

  .frame-block {
    width: 100%;
    height: 100%;
    min-height: 72px;
    padding: 10px 12px;
    border-radius: var(--dbc-radius-sm, 6px);
    border: 2px solid color-mix(in srgb, var(--vscode-focusBorder) 55%, var(--vscode-panel-border));
    background: var(--vscode-editor-background);
    box-sizing: border-box;
  }

  .frame-block:hover {
    border-color: var(--vscode-focusBorder);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .frame-head-btn {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    margin: 0 0 8px 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
  }

  .frame-head-btn:hover .frame-name {
    text-decoration: underline;
  }

  .frame-head-btn:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 2px;
  }

  .frame-name {
    font-size: 14px;
    font-weight: 700;
  }

  .frame-meta {
    font-size: 11px;
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-descriptionForeground);
  }

  .frame-empty {
    margin: 0;
    font-size: 11px;
    font-style: italic;
    color: var(--vscode-descriptionForeground);
  }

  .signal-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sig-pill {
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--vscode-focusBorder) 40%, var(--vscode-panel-border));
    background: color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent);
    font-size: 11px;
    font-family: var(--vscode-editor-font-family, monospace);
    cursor: pointer;
    color: inherit;
  }

  .sig-pill:hover {
    border-color: var(--vscode-focusBorder);
  }

  .sig-pill.static {
    cursor: default;
  }

  .sig-pill.static:hover {
    border-color: color-mix(in srgb, var(--vscode-focusBorder) 40%, var(--vscode-panel-border));
  }

  .rx-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 72px;
    padding: 10px 12px;
    border-radius: var(--dbc-radius-sm, 6px);
    border: 1px solid var(--dbc-border, var(--vscode-panel-border));
    background: color-mix(in srgb, #10b981 10%, var(--vscode-editor-background));
    box-sizing: border-box;
  }

  .rx-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
  }

  .rx-nodes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ecu-chip {
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, #10b981 45%, var(--vscode-panel-border));
    background: color-mix(in srgb, var(--vscode-editor-background) 88%, #10b981);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
  }

  .ecu-chip:hover {
    border-color: var(--vscode-focusBorder);
  }

  .ecu-chip.unknown {
    border-style: dashed;
  }

  .aside-block {
    padding: 12px 14px;
    border-radius: var(--dbc-radius-sm, 6px);
    border: 1px dashed var(--vscode-panel-border);
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 96%,
      var(--vscode-list-hoverBackground)
    );
  }

  .pool-block {
    border-color: color-mix(in srgb, #f59e0b 35%, var(--vscode-panel-border));
  }

  .aside-title {
    margin: 0 0 6px 0;
    font-size: 12px;
    font-weight: 600;
  }

  .aside-text {
    margin: 0 0 8px 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--vscode-descriptionForeground);
  }

  .aside-text code {
    font-size: 10px;
  }

  .pool-list {
    margin: 0;
    padding-left: 18px;
    font-size: 11px;
    font-family: var(--vscode-editor-font-family, monospace);
    line-height: 1.5;
  }
</style>
