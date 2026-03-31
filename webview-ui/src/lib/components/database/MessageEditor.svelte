<script lang="ts">
    /**
     * CAN message list and editor with links to nodes (transmitters).
     */
    import type { MessageDescriptor, NodeDescriptor, SignalDescriptor } from '../../types';
    import DataTable from '../shared/DataTable.svelte';
    import PropertyGrid from '../shared/PropertyGrid.svelte';
    import SearchFilter from '../shared/SearchFilter.svelte';
    import BitLayoutView from './BitLayoutView.svelte';
    import { get } from 'svelte/store';
    import { vscode } from '../../vscode';
    import { documentUri } from '../../stores/editorContext';

    interface Props {
        messages: MessageDescriptor[];
        nodes: NodeDescriptor[];
        /** Global pool — pick a signal to link to the selected frame. */
        signalPool: SignalDescriptor[];
        selectedMessageId?: number | null;
        onGotoNode?: (nodeName: string) => void;
        /** Jump to Signals tab for the current frame (optional). */
        onNavigateToSignals?: () => void;
        /** From payload layout legend — open Signals tab for a signal. */
        onNavigateToSignal?: (messageId: number, signalName: string) => void;
    }

    let {
        messages,
        nodes,
        signalPool,
        selectedMessageId = $bindable(null),
        onGotoNode,
        onNavigateToSignals,
        onNavigateToSignal,
    }: Props = $props();

    /** Right pane: edit frame vs full payload bit layout. */
    let messageSubTab = $state<'frame' | 'layout'>('frame');

    /** Pool signal name to link next (from dropdown). */
    let linkPick = $state('');

    let filterText = $state('');
    let selectedIndex: number | null = $state(null);
    /** Row index in the signal table (sorted order). */
    let selectedSignalIndex: number | null = $state(null);
    /** Name of the selected signal row (for remove; not index-based — table may be sorted). */
    let selectedSignalName: string | null = $state(null);
    /** Transmitter field draft (commit on blur / quick pick). */
    let txDraft = $state('');
    let quickPickTx = $state('');

    let sortedNodeNames = $derived(
        [...nodes].map((n) => n.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    );

    const columns = [
        { key: 'name', label: 'Name', width: '180px' },
        { key: 'idHex', label: 'ID (hex)', width: '100px' },
        { key: 'dlc', label: 'DLC', width: '50px' },
        { key: 'transmitter', label: 'Transmitter', width: '140px' },
        { key: 'signalCount', label: 'Signals', width: '70px' },
    ];

    let filteredMessages = $derived.by(() => {
        if (!filterText) return messages;
        const lower = filterText.toLowerCase();
        return messages.filter(
            (m) =>
                m.name.toLowerCase().includes(lower) ||
                m.id.toString(16).includes(lower) ||
                m.transmitter.toLowerCase().includes(lower),
        );
    });

    let rows = $derived(
        filteredMessages.map((m) => ({
            messageId: m.id,
            name: m.name,
            idHex: `0x${m.id.toString(16).toUpperCase().padStart(3, '0')}`,
            dlc: m.dlc,
            transmitter: m.transmitter,
            signalCount: m.signals.length,
        })),
    );

    let selectedMessage = $derived(
        selectedMessageId !== null ? messages.find((m) => m.id === selectedMessageId) ?? null : null,
    );

    let poolSignalsNotOnFrame = $derived.by(() => {
        if (!selectedMessage) return [];
        const linked = new Set(selectedMessage.signals.map((s) => s.name));
        return signalPool.filter((s) => !linked.has(s.name));
    });

    let transmitterKnown = $derived(
        selectedMessage?.transmitter
            ? nodes.some((n) => n.name === selectedMessage.transmitter)
            : false,
    );

    let detailProps = $derived(
        selectedMessage
            ? [
                  { key: 'name', label: 'Name', value: selectedMessage.name, type: 'text' as const },
                  { key: 'id', label: 'ID (decimal)', value: selectedMessage.id, type: 'number' as const },
                  { key: 'dlc', label: 'DLC', value: selectedMessage.dlc, type: 'number' as const },
                  { key: 'comment', label: 'Comment', value: selectedMessage.comment, type: 'text' as const },
              ]
            : [],
    );

    let sigColumns = [
        { key: 'name', label: 'Signal', width: '150px' },
        { key: 'startBit', label: 'Start', width: '52px' },
        { key: 'bitLength', label: 'Bits', width: '44px' },
        { key: 'byteOrder', label: 'Endian', width: '72px' },
        { key: 'unit', label: 'Unit', width: '56px' },
    ];

    let sigRows = $derived(
        selectedMessage
            ? selectedMessage.signals.map((s) => ({
                  name: s.name,
                  startBit: s.startBit,
                  bitLength: s.bitLength,
                  byteOrder: s.byteOrder === 'little_endian' ? 'Intel' : 'Motorola',
                  unit: s.unit || '—',
              }))
            : [],
    );

    $effect(() => {
        const m = selectedMessage;
        txDraft = m?.transmitter ?? '';
    });

    $effect(() => {
        selectedMessageId;
        selectedSignalIndex = null;
        selectedSignalName = null;
        linkPick = '';
        messageSubTab = 'frame';
    });

    function onPropertyChange(key: string, value: string | number | boolean) {
        if (selectedMessageId === null) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'updateMessage',
            payload: {
                documentUri: uri,
                messageId: selectedMessageId,
                changes: { [key]: value },
            },
        });
    }

    function commitTransmitter() {
        if (selectedMessageId === null) return;
        const cur = selectedMessage?.transmitter ?? '';
        const next = txDraft.trim();
        if (next === cur) return;
        onPropertyChange('transmitter', next);
    }

    function applyQuickPickTransmitter() {
        if (!quickPickTx) return;
        txDraft = quickPickTx;
        onPropertyChange('transmitter', quickPickTx.trim());
        quickPickTx = '';
    }

    function addMessage() {
        const uri = get(documentUri);
        if (!uri) return;
        let nextId = 0x100;
        for (const m of messages) {
            if (m.id >= nextId) nextId = m.id + 1;
        }
        vscode.postMessage({
            type: 'addMessage',
            payload: {
                documentUri: uri,
                name: `NEW_MSG_${nextId.toString(16)}`,
                id: nextId,
                dlc: 8,
            },
        });
    }

    function removeSelectedMessage() {
        if (selectedMessageId === null) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'removeMessage',
            payload: { documentUri: uri, messageId: selectedMessageId },
        });
        selectedMessageId = null;
        selectedIndex = null;
    }

    function linkPoolSignalToSelectedMessage() {
        if (selectedMessageId === null || !linkPick) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'linkSignalToMessage',
            payload: {
                documentUri: uri,
                messageId: selectedMessageId,
                signalName: linkPick,
            },
        });
        linkPick = '';
    }

    function removeSignalFromSelectedMessage() {
        if (selectedMessageId === null || !selectedSignalName) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'removeSignal',
            payload: {
                documentUri: uri,
                messageId: selectedMessageId,
                signalName: selectedSignalName,
            },
        });
        selectedSignalIndex = null;
        selectedSignalName = null;
    }
</script>

<div class="message-editor">
    <div class="toolbar">
        <SearchFilter placeholder="Filter messages…" onFilter={(t) => (filterText = t)} />
        <button type="button" class="btn" onclick={addMessage}>Add message</button>
        <button type="button" class="btn danger" onclick={removeSelectedMessage} disabled={selectedMessageId === null}>
            Remove message
        </button>
    </div>

    <div class="editor-split">
        <section class="list-pane" aria-label="Message list">
            {#if selectedMessage}
                {@const msg = selectedMessage}
                <div class="context-strip">
                    <span class="ctx-label">Selected frame</span>
                    <span class="dbc-pill">{msg.name}</span>
                    <span class="ctx-id">0x{msg.id.toString(16).toUpperCase()}</span>
                    <span class="ctx-meta">{msg.signals.length} signals · DLC {msg.dlc}</span>
                    <div class="ctx-actions">
                        {#if msg.transmitter}
                            <span class="ctx-tx">
                                Tx:
                                {#if transmitterKnown && onGotoNode}
                                    <button type="button" class="dbc-link" onclick={() => onGotoNode(msg.transmitter)}>
                                        {msg.transmitter}
                                    </button>
                                {:else}
                                    <span class="tx-name">{msg.transmitter || '—'}</span>
                                {/if}
                            </span>
                        {/if}
                    </div>
                </div>
            {/if}

            <div class="table-area dbc-card">
                <DataTable
                    {columns}
                    {rows}
                    {selectedIndex}
                    onSelect={(i, row) => {
                        selectedIndex = i;
                        selectedMessageId = row.messageId as number;
                    }}
                    emptyText="No messages defined"
                />
            </div>
        </section>

        <section class="detail-pane" aria-label="Frame details">
            {#if selectedMessage}
                {@const msg = selectedMessage}
                <div class="detail-subtabs" role="tablist" aria-label="Frame view">
                    <button
                        type="button"
                        role="tab"
                        class:active={messageSubTab === 'frame'}
                        aria-selected={messageSubTab === 'frame'}
                        onclick={() => (messageSubTab = 'frame')}
                    >
                        Frame
                    </button>
                    <button
                        type="button"
                        role="tab"
                        class:active={messageSubTab === 'layout'}
                        aria-selected={messageSubTab === 'layout'}
                        onclick={() => (messageSubTab = 'layout')}
                    >
                        Payload layout
                    </button>
                </div>

                {#if messageSubTab === 'frame'}
                    <div class="detail-frame-scroll">
                        <div class="signals-panel dbc-card">
                            <div class="dbc-card-header subtle-head signals-head">
                                <span>Signals in this frame</span>
                                <div class="signals-head-actions">
                                    {#if onNavigateToSignals}
                                        <button type="button" class="dbc-link sm-link" onclick={() => onNavigateToSignals()}>
                                            Open Signals tab →
                                        </button>
                                    {/if}
                                    <label class="link-pick">
                                        <span class="sr-only">Signal from pool</span>
                                        <select bind:value={linkPick} title="Signals must exist in the pool (Signals tab)">
                                            <option value="">Add from pool…</option>
                                            {#each poolSignalsNotOnFrame as s}
                                                <option value={s.name}>{s.name}</option>
                                            {/each}
                                        </select>
                                    </label>
                                    <button
                                        type="button"
                                        class="btn btn-primary btn-compact"
                                        onclick={linkPoolSignalToSelectedMessage}
                                        disabled={!linkPick || poolSignalsNotOnFrame.length === 0}
                                    >
                                        Add to frame
                                    </button>
                                    <button
                                        type="button"
                                        class="btn danger btn-compact"
                                        onclick={removeSignalFromSelectedMessage}
                                        disabled={selectedSignalName === null}
                                    >
                                        Unlink from frame
                                    </button>
                                </div>
                            </div>
                            <div class="dbc-card-body signals-body">
                                <div class="table-area signals-table-wrap">
                                    <DataTable
                                        columns={sigColumns}
                                        rows={sigRows}
                                        selectedIndex={selectedSignalIndex}
                                        onSelect={(i, row) => {
                                            selectedSignalIndex = i;
                                            selectedSignalName = row.name != null ? String(row.name) : null;
                                        }}
                                        emptyText="No signals linked — create signals in the Signals tab, then add from pool"
                                    />
                                </div>
                            </div>
                        </div>

                        <div class="detail-panel dbc-card">
                            <div class="dbc-card-header subtle-head">
                                <span>Message properties</span>
                            </div>
                            <div class="dbc-card-body">
                                <div class="tx-field">
                                    <span class="tx-label">Transmitter (ECU)</span>
                                    <div class="tx-row">
                                        <select
                                            class="tx-select"
                                            bind:value={quickPickTx}
                                            onchange={applyQuickPickTransmitter}
                                            title="Choose an existing network node"
                                        >
                                            <option value="">Quick pick…</option>
                                            {#each sortedNodeNames as n}
                                                <option value={n}>{n}</option>
                                            {/each}
                                        </select>
                                        <input
                                            class="tx-input"
                                            type="text"
                                            list="tx-ecu-datalist-{msg.id}"
                                            placeholder="Type name or pick above — new names add a node"
                                            bind:value={txDraft}
                                            onblur={() => commitTransmitter()}
                                            onkeydown={(e: KeyboardEvent) =>
                                                e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                                        />
                                        <datalist id="tx-ecu-datalist-{msg.id}">
                                            {#each sortedNodeNames as n}
                                                <option value={n}></option>
                                            {/each}
                                        </datalist>
                                    </div>
                                    <p class="tx-hint">
                                        Matches the <strong>BU_:</strong> list. Unknown names are added as nodes when you apply the field.
                                    </p>
                                </div>
                                <PropertyGrid properties={detailProps} onChange={onPropertyChange} />
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="detail-layout-scroll">
                        <div class="layout-bit-wrap">
                            <BitLayoutView message={msg} onNavigateToSignal={onNavigateToSignal} />
                        </div>
                    </div>
                {/if}
            {:else}
                <div class="detail-placeholder">
                    Select a message in the list to link signals from the pool and edit frame properties.
                </div>
            {/if}
        </section>
    </div>
</div>

<style>
    .message-editor {
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
        flex: 0 1 40%;
        max-width: 500px;
        min-width: 180px;
        display: flex;
        flex-direction: column;
        min-height: 0;
        gap: 10px;
    }

    .list-pane .context-strip {
        flex-shrink: 0;
    }

    .detail-pane {
        flex: 1;
        min-width: 260px;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .detail-subtabs {
        flex-shrink: 0;
        display: flex;
        gap: 4px;
        padding-bottom: 8px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    }

    .detail-subtabs button {
        padding: 6px 14px;
        border: none;
        background: transparent;
        color: var(--vscode-tab-inactiveForeground);
        font-family: inherit;
        font-size: inherit;
        cursor: pointer;
        border-radius: 6px 6px 0 0;
        border-bottom: 2px solid transparent;
    }

    .detail-subtabs button:hover {
        color: var(--vscode-tab-activeForeground);
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
    }

    .detail-subtabs button.active {
        color: var(--vscode-tab-activeForeground);
        border-bottom-color: var(--vscode-focusBorder);
        font-weight: 600;
    }

    .detail-frame-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 4px;
    }

    .detail-layout-scroll {
        flex: 1;
        min-height: 0;
        overflow: auto;
    }

    .layout-bit-wrap :global(.bit-layout) {
        margin-top: 0;
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
            max-height: 40vh;
        }
    }

    .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
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

    .btn.danger {
        color: var(--vscode-errorForeground);
    }

    .btn-primary {
        background: var(--vscode-button-background) !important;
        color: var(--vscode-button-foreground) !important;
        font-weight: 600;
    }

    .btn-primary:hover {
        background: var(--vscode-button-hoverBackground) !important;
    }

    .context-strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-list-hoverBackground));
        font-size: 12px;
    }

    .ctx-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vscode-descriptionForeground);
    }

    .ctx-id {
        font-family: var(--vscode-editor-font-family, monospace);
        color: var(--vscode-descriptionForeground);
    }

    .ctx-meta {
        color: var(--vscode-descriptionForeground);
    }

    .ctx-actions {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .ctx-tx {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    .tx-name {
        font-weight: 500;
    }

    .table-area {
        flex: 1;
        min-height: 0;
        overflow: auto;
    }

    .detail-pane .detail-panel {
        min-width: 0;
    }

    .subtle-head {
        font-size: 12px !important;
    }

    .tx-field {
        margin-bottom: 14px;
    }

    .tx-label {
        display: block;
        font-size: 0.9em;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 6px;
    }

    .tx-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }

    .tx-select {
        flex: 0 0 auto;
        min-width: 120px;
        max-width: 200px;
        padding: 5px 8px;
        border-radius: 6px;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        font-family: inherit;
        font-size: 13px;
    }

    .tx-input {
        flex: 1;
        min-width: 160px;
        padding: 5px 10px;
        border-radius: 6px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        font-family: inherit;
        font-size: 13px;
    }

    .tx-input:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }

    .tx-hint {
        margin: 6px 0 0 0;
        font-size: 11px;
        line-height: 1.4;
        color: var(--vscode-descriptionForeground);
    }

    .signals-panel {
        flex-shrink: 0;
    }

    .detail-pane .signals-panel {
        min-width: 0;
    }

    .signals-head {
        flex-wrap: wrap;
        gap: 8px;
    }

    .signals-head-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-left: auto;
    }

    .sm-link {
        font-size: 12px;
    }

    .btn-compact {
        padding: 4px 10px;
        font-size: 12px;
    }

    .signals-body {
        padding-top: 0;
    }

    .signals-table-wrap {
        min-height: 100px;
    }

    .link-pick select {
        padding: 4px 8px;
        min-width: 160px;
        max-width: 220px;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        border-radius: 4px;
        font-family: inherit;
        font-size: 12px;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
</style>
