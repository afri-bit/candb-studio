<script lang="ts">
  /**
   * Global signal pool: create and edit definitions here.
   * Messages reference these by name; frame layout is per message (Messages tab).
   * Editing layout on Definition updates the pool and propagates to all linked frames.
   * Editing layout per frame here calls updateSignal (that frame only).
   */
  import { tick, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import type {
    MessageDescriptor,
    SignalDescriptor,
    SignalValueType,
    ValueTableDescriptor,
  } from '../../types';
  import DataTable from '../shared/DataTable.svelte';
  import PropertyGrid from '../shared/PropertyGrid.svelte';
  import SearchFilter from '../shared/SearchFilter.svelte';
  import { vscode } from '../../vscode';
  import { documentUri } from '../../stores/editorContext';

  interface Props {
    signalPool: SignalDescriptor[];
    valueTables: ValueTableDescriptor[];
    messages: MessageDescriptor[];
    /** When `messageId` is omitted, the pool list is shown unfiltered (all signals). */
    focusSignal?: { messageId?: number; signalName: string } | null;
    onFocusConsumed?: () => void;
    onOpenMessage?: (messageId: number) => void;
  }

  let {
    signalPool,
    valueTables,
    messages,
    focusSignal = null,
    onFocusConsumed,
    onOpenMessage,
  }: Props = $props();

  type SignalDetailTab =
    | 'definition'
    | 'messages'
    | 'receivers'
    | 'attributes'
    | 'values'
    | 'comment';

  let filterText = $state('');
  let messageFilter = $state<string>('all');
  let selectedIndex: number | null = $state(null);
  let signalTab = $state<SignalDetailTab>('definition');

  /** Draft for Receivers tab — committed on blur. */
  let receiversDraft = $state('');
  /** Draft for Comment tab. */
  let commentDraft = $state('');
  /** Editable VAL_ rows: raw string + label. */
  let valueDescRows = $state<{ raw: string; label: string }[]>([{ raw: '', label: '' }]);

  /** Messages tab — link signal to a frame (choose message + start bit only). */
  let messagePickFilter = $state('');
  let linkPickId = $state('');
  let linkStartBit = $state(0);

  function messagesUsingSignal(signalName: string): string {
    const names: string[] = [];
    for (const m of messages) {
      if (m.signals.some((s) => s.name === signalName)) {
        names.push(m.name);
      }
    }
    return names.length ? names.join(', ') : '—';
  }

  function messagesWithSignal(
    signalName: string,
  ): { messageId: number; messageName: string; dlc: number; sig: SignalDescriptor }[] {
    const out: {
      messageId: number;
      messageName: string;
      dlc: number;
      sig: SignalDescriptor;
    }[] = [];
    for (const m of messages) {
      const sig = m.signals.find((s) => s.name === signalName);
      if (sig) {
        out.push({ messageId: m.id, messageName: m.name, dlc: m.dlc, sig });
      }
    }
    return out;
  }

  function isSignalLinked(signalName: string): boolean {
    return messages.some((m) => m.signals.some((s) => s.name === signalName));
  }

  let filteredPool = $derived.by(() => {
    let list = signalPool;
    if (messageFilter !== 'all') {
      const mid = Number(messageFilter);
      const msg = messages.find((m) => m.id === mid);
      if (msg) {
        const onFrame = new Set(msg.signals.map((s) => s.name));
        list = signalPool.filter((s) => onFrame.has(s.name));
      }
    }
    if (!filterText) return list;
    const lower = filterText.toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.unit.toLowerCase().includes(lower) ||
        messagesUsingSignal(s.name).toLowerCase().includes(lower),
    );
  });

  const columns = [
    { key: 'name', label: 'Signal', width: '160px' },
    { key: 'usedIn', label: 'Used in messages', width: '200px' },
    { key: 'startBit', label: 'Def. start', width: '72px' },
    { key: 'bitLength', label: 'Def. len', width: '56px' },
    { key: 'byteOrder', label: 'Endian', width: '88px' },
    { key: 'factor', label: 'Factor', width: '64px' },
    { key: 'unit', label: 'Unit', width: '52px' },
  ];

  let rows = $derived(
    filteredPool.map((s) => ({
      name: s.name,
      usedIn: messagesUsingSignal(s.name),
      startBit: s.startBit,
      bitLength: s.bitLength,
      byteOrder: s.byteOrder === 'little_endian' ? 'Intel' : 'Motorola',
      factor: s.factor,
      unit: s.unit || '—',
    })),
  );

  let selectedSignal: SignalDescriptor | null = $derived(
    selectedIndex !== null ? (filteredPool[selectedIndex] ?? null) : null,
  );

  /** Messages that do not yet reference this pool signal. */
  let messagesNotLinked = $derived.by(() => {
    if (!selectedSignal) return [];
    return messages.filter((m) => !m.signals.some((s) => s.name === selectedSignal!.name));
  });

  let filteredMessagesToLink = $derived.by(() => {
    const list = messagesNotLinked;
    if (!messagePickFilter.trim()) return list;
    const lower = messagePickFilter.toLowerCase();
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        `0x${m.id.toString(16)}`.includes(lower) ||
        m.id.toString().includes(lower),
    );
  });

  let frameRows = $derived(selectedSignal ? messagesWithSignal(selectedSignal.name) : []);

  /** Definition tab — pool defaults (also propagated to all frames when layout changes). */
  let definitionProps = $derived(
    selectedSignal
      ? [
          { key: 'name', label: 'Name', value: selectedSignal.name, type: 'text' as const },
          {
            key: 'bitLength',
            label: 'Length [bit]',
            value: selectedSignal.bitLength,
            type: 'number' as const,
          },
          {
            key: 'byteOrder',
            label: 'Byte order',
            value: selectedSignal.byteOrder,
            type: 'select' as const,
            options: ['little_endian', 'big_endian'],
          },
          { key: 'unit', label: 'Unit', value: selectedSignal.unit, type: 'text' as const },
          {
            key: 'valueType',
            label: 'Value type',
            value: selectedSignal.valueType,
            type: 'select' as const,
            options: ['integer', 'float', 'double'],
          },
          {
            key: 'isSigned',
            label: 'Signed (integer)',
            value: selectedSignal.isSigned,
            type: 'boolean' as const,
          },
          {
            key: 'factor',
            label: 'Factor',
            value: selectedSignal.factor,
            type: 'number' as const,
          },
          {
            key: 'offset',
            label: 'Offset',
            value: selectedSignal.offset,
            type: 'number' as const,
          },
          {
            key: 'minimum',
            label: 'Minimum',
            value: selectedSignal.minimum,
            type: 'number' as const,
          },
          {
            key: 'maximum',
            label: 'Maximum',
            value: selectedSignal.maximum,
            type: 'number' as const,
          },
          {
            key: 'valueTableName',
            label: 'Value table',
            value: selectedSignal.valueTableName ?? '',
            type: 'select' as const,
            options: ['', ...valueTables.map((t) => t.name)],
          },
        ]
      : [],
  );

  /** Start bit default lives on the pool and syncs to all frames when changed here. */
  let layoutDefaultProps = $derived(
    selectedSignal
      ? [
          {
            key: 'startBit',
            label: 'Default start bit',
            value: selectedSignal.startBit,
            type: 'number' as const,
          },
        ]
      : [],
  );

  function rawRangeForBits(
    bitLength: number,
    valueType: SignalValueType,
    isSigned: boolean,
  ): [number, number] {
    if (bitLength <= 0 || bitLength > 64) {
      return [0, 0];
    }
    if (valueType === 'float' || valueType === 'double') {
      return [-Number.MAX_VALUE, Number.MAX_VALUE];
    }
    if (isSigned) {
      const max = 2 ** (bitLength - 1) - 1;
      const min = -(2 ** (bitLength - 1));
      return [min, max];
    }
    return [0, 2 ** bitLength - 1];
  }

  function calculateMinMaxFromRaw() {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    if (selectedSignal.valueType !== 'integer') {
      return;
    }
    const [rawMin, rawMax] = rawRangeForBits(
      selectedSignal.bitLength,
      selectedSignal.valueType,
      selectedSignal.isSigned,
    );
    const p1 = rawMin * selectedSignal.factor + selectedSignal.offset;
    const p2 = rawMax * selectedSignal.factor + selectedSignal.offset;
    vscode.postMessage({
      type: 'updatePoolSignal',
      payload: {
        documentUri: uri,
        signalName: selectedSignal.name,
        changes: {
          minimum: Math.min(p1, p2),
          maximum: Math.max(p1, p2),
        },
      },
    });
  }

  function onPropertyChange(key: string, value: string | number | boolean) {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({
      type: 'updatePoolSignal',
      payload: {
        documentUri: uri,
        signalName: selectedSignal.name,
        changes: { [key]: value },
      },
    });
  }

  /** Per-frame placement: only start bit (length and endian come from Definition). */
  function onFrameStartBitChange(messageId: number, value: number) {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({
      type: 'updateSignal',
      payload: {
        documentUri: uri,
        messageId,
        signalName: selectedSignal.name,
        changes: { startBit: Math.floor(value) },
      },
    });
  }

  function linkSignalToChosenMessage() {
    if (!selectedSignal || !linkPickId) return;
    const uri = get(documentUri);
    if (!uri) return;
    const messageId = Number(linkPickId);
    vscode.postMessage({
      type: 'linkSignalToMessage',
      payload: {
        documentUri: uri,
        messageId,
        signalName: selectedSignal.name,
        startBit: Math.floor(linkStartBit),
      },
    });
    linkPickId = '';
  }

  function unlinkSignalFromMessage(messageId: number) {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({
      type: 'removeSignal',
      payload: {
        documentUri: uri,
        messageId,
        signalName: selectedSignal.name,
      },
    });
  }

  function commitReceivers() {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({
      type: 'updatePoolSignal',
      payload: {
        documentUri: uri,
        signalName: selectedSignal.name,
        changes: { receivers: receiversDraft },
      },
    });
  }

  function commitComment() {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    if (commentDraft === (selectedSignal.comment ?? '')) return;
    vscode.postMessage({
      type: 'updatePoolSignal',
      payload: {
        documentUri: uri,
        signalName: selectedSignal.name,
        changes: { comment: commentDraft },
      },
    });
  }

  function entriesToValRows(
    entries: Record<number, string> | undefined,
  ): { raw: string; label: string }[] {
    const e = entries ?? {};
    const keys = Object.keys(e)
      .map((k) => Number(k))
      .filter((k) => Number.isFinite(k))
      .sort((a, b) => a - b);
    if (keys.length === 0) {
      return [{ raw: '', label: '' }];
    }
    return keys.map((k) => ({ raw: String(k), label: e[k] ?? '' }));
  }

  function valRowsToEntries(rows: { raw: string; label: string }[]): Record<number, string> | null {
    const out: Record<number, string> = {};
    for (const r of rows) {
      const rawTrim = r.raw.trim();
      const labelTrim = r.label.trim();
      if (rawTrim === '' && labelTrim === '') {
        continue;
      }
      if (rawTrim === '') {
        return null;
      }
      const n = Number(rawTrim);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return null;
      }
      out[n] = labelTrim;
    }
    return out;
  }

  function commitValueDescriptions() {
    if (!selectedSignal) return;
    const uri = get(documentUri);
    if (!uri) return;
    const entries = valRowsToEntries(valueDescRows);
    if (entries === null) {
      return;
    }
    vscode.postMessage({
      type: 'updatePoolSignal',
      payload: {
        documentUri: uri,
        signalName: selectedSignal.name,
        changes: { valueDescriptions: entries },
      },
    });
  }

  function addValRow() {
    valueDescRows = [...valueDescRows, { raw: '', label: '' }];
  }

  function removeValRow(i: number) {
    valueDescRows = valueDescRows.filter((_, j) => j !== i);
    if (valueDescRows.length === 0) {
      valueDescRows = [{ raw: '', label: '' }];
    }
  }

  $effect(() => {
    const s = selectedSignal;
    if (!s) {
      receiversDraft = '';
      commentDraft = '';
      valueDescRows = [{ raw: '', label: '' }];
      return;
    }
    receiversDraft = s.receivers?.length ? s.receivers.join(', ') : '';
    commentDraft = s.comment ?? '';
    valueDescRows = entriesToValRows(s.valueDescriptions);
    linkStartBit = s.startBit;
    linkPickId = '';
  });

  $effect(() => {
    selectedIndex;
    signalTab = 'definition';
  });

  function defaultNewPoolSignal(): Record<string, unknown> {
    let name = 'NewSignal';
    let n = 1;
    while (signalPool.some((s) => s.name === name)) {
      name = `NewSignal_${n++}`;
    }
    return {
      name,
      startBit: 0,
      bitLength: 8,
      byteOrder: 'little_endian',
      isSigned: false,
      factor: 1,
      offset: 0,
      minimum: 0,
      maximum: 255,
      unit: '',
      receivers: [],
      valueType: 'integer',
      multiplex: 'none',
      comment: '',
      valueDescriptions: {},
      valueTableName: '',
    };
  }

  function addSignalToPool() {
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({
      type: 'addPoolSignal',
      payload: {
        documentUri: uri,
        signal: defaultNewPoolSignal(),
      },
    });
  }

  function removeSelectedFromPool() {
    if (!selectedSignal) return;
    if (isSignalLinked(selectedSignal.name)) {
      return;
    }
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({
      type: 'removePoolSignal',
      payload: {
        documentUri: uri,
        signalName: selectedSignal.name,
      },
    });
    selectedIndex = null;
  }

  $effect(() => {
    const f = focusSignal;
    if (!f) return;
    void (async () => {
      messageFilter = f.messageId !== undefined && f.messageId >= 0 ? String(f.messageId) : 'all';
      filterText = '';
      await tick();
      const idx = untrack(() => filteredPool.findIndex((s) => s.name === f.signalName));
      selectedIndex = f.signalName && idx >= 0 ? idx : null;
      signalTab = 'definition';
      onFocusConsumed?.();
    })();
  });

  const tabDefs: { id: SignalDetailTab; label: string; hint?: string }[] = [
    { id: 'definition', label: 'Definition' },
    { id: 'messages', label: 'Messages' },
    { id: 'receivers', label: 'Receivers' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'values', label: 'Value descriptions' },
    { id: 'comment', label: 'Comment' },
  ];
</script>

<div class="signal-editor">
  <p class="hint">
    Pool signals are shared by name. <strong>Definition</strong> sets bit length, byte order,
    scaling, and the default start bit (defaults apply to all linked frames). On
    <strong>Messages</strong>, pick a frame and set only the <strong>start bit</strong> for that frame.
  </p>
  <div class="toolbar">
    <label class="filter-label">
      Show in message
      <select
        bind:value={messageFilter}
        onchange={() => {
          selectedIndex = null;
        }}
      >
        <option value="all">All signals (pool)</option>
        {#each messages as m}
          <option value={String(m.id)}>{m.name}</option>
        {/each}
      </select>
    </label>
    <SearchFilter placeholder="Filter signals…" onFilter={(t) => (filterText = t)} />
    <button type="button" class="btn btn-primary" onclick={addSignalToPool}>Create signal</button>
    <button
      type="button"
      class="btn danger"
      onclick={removeSelectedFromPool}
      disabled={selectedSignal === null ||
        (selectedSignal !== null && isSignalLinked(selectedSignal.name))}
      title={selectedSignal && isSignalLinked(selectedSignal.name)
        ? 'Unlink this signal from all messages in the Messages tab first'
        : 'Remove from pool'}
    >
      Remove from pool
    </button>
  </div>

  <div class="editor-split">
    <section class="list-pane" aria-label="Signal list">
      <div class="table-area dbc-card">
        <DataTable
          {columns}
          {rows}
          {selectedIndex}
          onSelect={(i) => (selectedIndex = i)}
          emptyText="No signals in pool — use Create signal"
        />
      </div>
    </section>
    <section class="detail-pane" aria-label="Signal properties">
      {#if selectedSignal}
        <div class="detail-panel dbc-card">
          <div class="dbc-card-header detail-head">
            <span>{selectedSignal.name}</span>
            {#if onOpenMessage && isSignalLinked(selectedSignal.name)}
              {@const firstMsg = messages.find((m) =>
                m.signals.some((s) => s.name === selectedSignal.name),
              )}
              {#if firstMsg}
                <button type="button" class="dbc-link" onclick={() => onOpenMessage(firstMsg.id)}>
                  Open a message using this signal →
                </button>
              {/if}
            {/if}
          </div>

          <div class="signal-tabs" role="tablist" aria-label="Signal editor sections">
            {#each tabDefs as t}
              <button
                type="button"
                role="tab"
                class:active={signalTab === t.id}
                aria-selected={signalTab === t.id}
                onclick={() => (signalTab = t.id)}
              >
                {t.label}
              </button>
            {/each}
          </div>

          <div class="dbc-card-body signal-tab-body">
            {#if signalTab === 'definition'}
              <PropertyGrid properties={definitionProps} onChange={onPropertyChange} />
              <div class="layout-extra">
                <span class="subheading">Frame placement defaults</span>
                <PropertyGrid properties={layoutDefaultProps} onChange={onPropertyChange} />
              </div>
              <div class="calc-row">
                <button type="button" class="btn" onclick={calculateMinMaxFromRaw}>
                  Calculate minimum and maximum (integer raw range)
                </button>
              </div>
            {:else if signalTab === 'messages'}
              <div class="msg-add-panel">
                <span class="subheading">Add to frame</span>
                <div class="msg-add-row">
                  <SearchFilter
                    placeholder="Filter by name or ID…"
                    onFilter={(t) => (messagePickFilter = t)}
                  />
                  <label class="inline-num">
                    <span>Start bit</span>
                    <input
                      type="number"
                      class="start-input"
                      bind:value={linkStartBit}
                      min="0"
                      max="63"
                    />
                  </label>
                  <label class="msg-pick">
                    <span class="sr-only">Message</span>
                    <select bind:value={linkPickId} title="Choose a message">
                      <option value="">Choose message…</option>
                      {#each filteredMessagesToLink as m}
                        <option value={String(m.id)}>
                          {m.name} (0x{m.id.toString(16).toUpperCase()}) · DLC {m.dlc}
                        </option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    class="btn btn-primary"
                    onclick={linkSignalToChosenMessage}
                    disabled={!linkPickId}
                  >
                    Add
                  </button>
                </div>
              </div>

              {#if frameRows.length === 0}
                <p class="empty-tab">
                  Not linked to any message yet. Choose a message above and click Add.
                </p>
              {:else}
                <span class="subheading linked-heading">Linked frames</span>
                <div class="msg-linked-table-wrap">
                  <table class="msg-linked-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>ID</th>
                        <th>DLC</th>
                        <th>Length (def.)</th>
                        <th>Start bit</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each frameRows as fr (fr.messageId)}
                        <tr>
                          <td class="cell-name">{fr.messageName}</td>
                          <td class="cell-mono">0x{fr.messageId.toString(16).toUpperCase()}</td>
                          <td class="cell-mono">{fr.dlc}</td>
                          <td class="cell-mono">{selectedSignal.bitLength}</td>
                          <td class="cell-start">
                            <input
                              type="number"
                              class="start-input"
                              min="0"
                              max="63"
                              value={fr.sig.startBit}
                              onchange={(e) =>
                                onFrameStartBitChange(
                                  fr.messageId,
                                  Number((e.currentTarget as HTMLInputElement).value),
                                )}
                            />
                          </td>
                          <td class="cell-actions">
                            {#if onOpenMessage}
                              <button
                                type="button"
                                class="dbc-link sm"
                                onclick={() => onOpenMessage(fr.messageId)}
                              >
                                Open
                              </button>
                            {/if}
                            <button
                              type="button"
                              class="btn danger btn-compact"
                              onclick={() => unlinkSignalFromMessage(fr.messageId)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {:else if signalTab === 'receivers'}
              <label class="recv-area">
                <span class="recv-label">Receivers</span>
                <textarea
                  class="recv-text"
                  rows={4}
                  bind:value={receiversDraft}
                  onblur={commitReceivers}
                  placeholder="e.g. ECU1, Gateway, Display"
                ></textarea>
              </label>
            {:else if signalTab === 'attributes'}
              <p class="empty-tab">
                Custom DBC attribute instances for this signal are not shown in the visual editor
                yet. Use the text view for SG_-level attributes, or extend serialization in a future
                release.
              </p>
            {:else if signalTab === 'values'}
              <div class="val-rows">
                {#each valueDescRows as row, i}
                  <div class="val-row">
                    <input type="text" class="val-raw" placeholder="Raw" bind:value={row.raw} />
                    <input
                      type="text"
                      class="val-label"
                      placeholder="Label"
                      bind:value={row.label}
                    />
                    <button
                      type="button"
                      class="btn icon-btn"
                      onclick={() => removeValRow(i)}
                      title="Remove row">×</button
                    >
                  </div>
                {/each}
              </div>
              <div class="val-actions">
                <button type="button" class="btn" onclick={addValRow}>Add row</button>
                <button type="button" class="btn btn-primary" onclick={commitValueDescriptions}>
                  Apply value descriptions
                </button>
              </div>
            {:else if signalTab === 'comment'}
              <label class="recv-area">
                <span class="recv-label">Comment</span>
                <textarea
                  class="recv-text"
                  rows={6}
                  bind:value={commentDraft}
                  onblur={commitComment}
                  placeholder="Documentation for this signal…"
                ></textarea>
              </label>
            {/if}
          </div>
        </div>
      {:else}
        <div class="detail-placeholder">
          Select a signal in the list to edit its definition, or create a new one.
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .signal-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
    flex: 1;
  }

  .editor-split {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
    gap: 12px;
    align-items: stretch;
  }

  .list-pane {
    flex: 0 1 44%;
    max-width: 560px;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .detail-pane {
    flex: 1;
    min-width: 240px;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .detail-placeholder {
    padding: 20px 16px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
    border: 1px dashed color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
    border-radius: var(--dbc-radius, 10px);
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 92%,
      var(--vscode-list-hoverBackground)
    );
  }

  @media (max-width: 720px) {
    .editor-split {
      flex-direction: column;
    }

    .list-pane {
      max-width: none;
      max-height: 42vh;
    }
  }

  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--vscode-descriptionForeground);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .filter-label select {
    padding: 4px 8px;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 4px;
    max-width: 200px;
  }

  .btn {
    padding: 4px 10px;
    cursor: pointer;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 6px;
    font-family: inherit;
    font-size: inherit;
  }

  .btn:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--vscode-button-background) !important;
    color: var(--vscode-button-foreground) !important;
    font-weight: 600;
  }

  .btn-primary:hover {
    background: var(--vscode-button-hoverBackground) !important;
  }

  .btn.danger {
    color: var(--vscode-errorForeground);
  }

  .table-area {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .detail-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .detail-head {
    font-size: 13px;
  }

  .signal-tabs {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 12px 0;
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
  }

  .signal-tabs button {
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--vscode-tab-inactiveForeground);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    border-bottom: 2px solid transparent;
  }

  .signal-tabs button:hover {
    color: var(--vscode-tab-activeForeground);
    background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
  }

  .signal-tabs button.active {
    color: var(--vscode-tab-activeForeground);
    border-bottom-color: var(--vscode-focusBorder);
    font-weight: 600;
  }

  .signal-tab-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .layout-extra {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent);
  }

  .subheading {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }

  .calc-row {
    margin-top: 12px;
  }

  .empty-tab {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
  }

  .msg-add-panel {
    margin-bottom: 16px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
    background: color-mix(
      in srgb,
      var(--vscode-editor-background) 96%,
      var(--vscode-list-hoverBackground)
    );
  }

  .msg-add-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    margin-top: 8px;
  }

  .msg-add-row :global(.search-filter) {
    flex: 1;
    min-width: 140px;
  }

  .inline-num {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .inline-num span {
    font-weight: 600;
  }

  .msg-pick select {
    min-width: 220px;
    max-width: min(420px, 100%);
    padding: 6px 8px;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border, transparent);
    border-radius: 4px;
    font-family: inherit;
    font-size: 12px;
  }

  .start-input {
    width: 72px;
    padding: 4px 8px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
  }

  .linked-heading {
    display: block;
    margin: 12px 0 8px 0;
  }

  .msg-linked-table-wrap {
    overflow-x: auto;
  }

  .msg-linked-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .msg-linked-table th,
  .msg-linked-table td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
  }

  .msg-linked-table th {
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .cell-name {
    font-weight: 500;
  }

  .cell-mono {
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-descriptionForeground);
  }

  .cell-start {
    width: 88px;
  }

  .cell-actions {
    white-space: nowrap;
    text-align: right;
  }

  .cell-actions .btn-compact {
    margin-left: 6px;
  }

  .dbc-link.sm {
    font-size: 12px;
  }

  .btn-compact {
    padding: 2px 8px;
    font-size: 11px;
  }

  .recv-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .recv-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
  }

  .recv-text {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 6px;
    resize: vertical;
  }

  .val-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .val-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .val-raw {
    width: 88px;
    flex-shrink: 0;
    padding: 4px 8px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
  }

  .val-label {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
  }

  .icon-btn {
    flex-shrink: 0;
    width: 28px;
    padding: 2px 0;
    line-height: 1;
  }

  .val-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
