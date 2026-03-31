<script lang="ts">
    /**
     * Global signal pool: create and edit definitions here.
     * Messages reference these by name; frame layout is edited per message.
     */
    import { tick, untrack } from 'svelte';
    import { get } from 'svelte/store';
    import type { MessageDescriptor, SignalDescriptor, ValueTableDescriptor } from '../../types';
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

    let filterText = $state('');
    /** 'all' or message id — filter pool rows that appear on that frame */
    let messageFilter = $state<string>('all');
    let selectedIndex: number | null = $state(null);

    function messagesUsingSignal(signalName: string): string {
        const names: string[] = [];
        for (const m of messages) {
            if (m.signals.some((s) => s.name === signalName)) {
                names.push(m.name);
            }
        }
        return names.length ? names.join(', ') : '—';
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
        selectedIndex !== null ? filteredPool[selectedIndex] ?? null : null,
    );

    let detailProps = $derived(
        selectedSignal
            ? [
                  { key: 'name', label: 'Name', value: selectedSignal.name, type: 'text' as const },
                  {
                      key: 'startBit',
                      label: 'Default start bit',
                      value: selectedSignal.startBit,
                      type: 'number' as const,
                  },
                  {
                      key: 'bitLength',
                      label: 'Default bit length',
                      value: selectedSignal.bitLength,
                      type: 'number' as const,
                  },
                  {
                      key: 'byteOrder',
                      label: 'Default byte order',
                      value: selectedSignal.byteOrder,
                      type: 'select' as const,
                      options: ['little_endian', 'big_endian'],
                  },
                  { key: 'isSigned', label: 'Signed', value: selectedSignal.isSigned, type: 'boolean' as const },
                  { key: 'factor', label: 'Factor', value: selectedSignal.factor, type: 'number' as const },
                  { key: 'offset', label: 'Offset', value: selectedSignal.offset, type: 'number' as const },
                  { key: 'minimum', label: 'Minimum', value: selectedSignal.minimum, type: 'number' as const },
                  { key: 'maximum', label: 'Maximum', value: selectedSignal.maximum, type: 'number' as const },
                  { key: 'unit', label: 'Unit', value: selectedSignal.unit, type: 'text' as const },
                  {
                      key: 'valueTableName',
                      label: 'Value table (VAL_TABLE_)',
                      value: selectedSignal.valueTableName ?? '',
                      type: 'select' as const,
                      options: ['', ...valueTables.map((t) => t.name)],
                  },
                  { key: 'comment', label: 'Comment', value: selectedSignal.comment, type: 'text' as const },
              ]
            : [],
    );

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
            messageFilter =
                f.messageId !== undefined && f.messageId >= 0 ? String(f.messageId) : 'all';
            filterText = '';
            await tick();
            const idx = untrack(() =>
                filteredPool.findIndex((s) => s.name === f.signalName),
            );
            selectedIndex = f.signalName && idx >= 0 ? idx : null;
            onFocusConsumed?.();
        })();
    });
</script>

<div class="signal-editor">
    <p class="hint">
        Create signals here first. Then add them to frames from the <strong>Messages</strong> tab. Removing a
        signal from a message does not delete it from this list.
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
            disabled={selectedSignal === null || (selectedSignal !== null && isSignalLinked(selectedSignal.name))}
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
                            {@const firstMsg = messages.find((m) => m.signals.some((s) => s.name === selectedSignal.name))}
                            {#if firstMsg}
                                <button type="button" class="dbc-link" onclick={() => onOpenMessage(firstMsg.id)}>
                                    Open a message using this signal →
                                </button>
                            {/if}
                        {/if}
                    </div>
                    <div class="dbc-card-body">
                        {#if selectedSignal.receivers?.length}
                            <p class="recv-line">
                                <span class="lbl">Receivers</span>
                                <span class="recv-chips">
                                    {#each selectedSignal.receivers as r}
                                        <span class="dbc-pill">{r}</span>
                                    {/each}
                                </span>
                            </p>
                        {/if}
                        <PropertyGrid properties={detailProps} onChange={onPropertyChange} />
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
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-list-hoverBackground));
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
    }

    .detail-head {
        font-size: 13px;
    }

    .recv-line {
        margin: 0 0 10px 0;
        font-size: 12px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    .recv-line .lbl {
        color: var(--vscode-descriptionForeground);
        font-weight: 600;
    }

    .recv-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
</style>
