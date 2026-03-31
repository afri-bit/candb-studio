<script lang="ts">
    /**
     * CAN message list and editor: tabbed detail (definition, signals, transmitters, receivers, layout, …).
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
        signalPool: SignalDescriptor[];
        selectedMessageId?: number | null;
        onGotoNode?: (nodeName: string) => void;
        onNavigateToSignals?: () => void;
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

    type MessageDetailTab =
        | 'definition'
        | 'signals'
        | 'transmitters'
        | 'receivers'
        | 'layout'
        | 'attributes'
        | 'comment';

    let messageDetailTab = $state<MessageDetailTab>('definition');

    let linkPick = $state('');
    /** Placement when adding a pool signal to this frame (DBC start bit). */
    let linkStartBit = $state(0);
    let filterText = $state('');
    let selectedIndex: number | null = $state(null);
    let selectedSignalIndex: number | null = $state(null);
    let selectedSignalName: string | null = $state(null);
    let txDraft = $state('');
    let quickPickTx = $state('');
    let commentDraft = $state('');

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

    /** Unique ECU names that receive this message (from SG_ receiver lists). */
    let messageReceiverNodes = $derived.by(() => {
        if (!selectedMessage) return [];
        const set = new Set<string>();
        for (const s of selectedMessage.signals) {
            for (const r of s.receivers ?? []) {
                const t = r.trim();
                if (t) set.add(t);
            }
        }
        return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    });

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

    let definitionProps = $derived(
        selectedMessage
            ? [
                  { key: 'name', label: 'Name', value: selectedMessage.name, type: 'text' as const },
                  { key: 'id', label: 'ID (decimal)', value: selectedMessage.id, type: 'number' as const },
                  { key: 'dlc', label: 'DLC', value: selectedMessage.dlc, type: 'number' as const },
              ]
            : [],
    );

    let maxPayloadBitIndex = $derived(
        selectedMessage ? Math.max(0, selectedMessage.dlc * 8 - 1) : 63,
    );

    let messageTitle = $derived(
        selectedMessage
            ? `${selectedMessage.name} (0x${selectedMessage.id.toString(16).toUpperCase()})`
            : '',
    );

    $effect(() => {
        const m = selectedMessage;
        txDraft = m?.transmitter ?? '';
        commentDraft = m?.comment ?? '';
    });

    $effect(() => {
        selectedMessageId;
        selectedSignalIndex = null;
        selectedSignalName = null;
        linkPick = '';
        linkStartBit = 0;
        messageDetailTab = 'definition';
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

    function clearTransmitter() {
        txDraft = '';
        onPropertyChange('transmitter', '');
    }

    function commitComment() {
        if (selectedMessageId === null) return;
        const cur = selectedMessage?.comment ?? '';
        if (commentDraft === cur) return;
        onPropertyChange('comment', commentDraft);
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
                startBit: Math.floor(linkStartBit),
            },
        });
        linkPick = '';
    }

    function onSignalStartBitChange(signalName: string, value: number) {
        if (selectedMessageId === null) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'updateSignal',
            payload: {
                documentUri: uri,
                messageId: selectedMessageId,
                signalName,
                changes: { startBit: Math.floor(value) },
            },
        });
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

    const detailTabs: { id: MessageDetailTab; label: string }[] = [
        { id: 'definition', label: 'Definition' },
        { id: 'signals', label: 'Signals' },
        { id: 'transmitters', label: 'Transmitters' },
        { id: 'receivers', label: 'Receivers' },
        { id: 'layout', label: 'Layout' },
        { id: 'attributes', label: 'Attributes' },
        { id: 'comment', label: 'Comment' },
    ];
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
                <div class="detail-panel dbc-card message-detail-card">
                    <div class="dbc-card-header detail-title-row">
                        <span class="detail-title">Message '{messageTitle}'</span>
                    </div>

                    <div class="message-tabs" role="tablist" aria-label="Message sections">
                        {#each detailTabs as t}
                            <button
                                type="button"
                                role="tab"
                                class:active={messageDetailTab === t.id}
                                aria-selected={messageDetailTab === t.id}
                                onclick={() => (messageDetailTab = t.id)}
                            >
                                {t.label}
                            </button>
                        {/each}
                    </div>

                    <div class="dbc-card-body message-tab-body">
                        {#if messageDetailTab === 'definition'}
                            <p class="tab-hint">Name, arbitration ID, and data length for this frame (DBC <code>BO_</code>).</p>
                            <PropertyGrid properties={definitionProps} onChange={onPropertyChange} />
                        {:else if messageDetailTab === 'signals'}
                            <p class="tab-hint">
                                Signals mapped into this frame. Add definitions in the <strong>Signals</strong> tab first,
                                then link them here. Edit <strong>Start</strong> to set each signal’s position in this
                                frame (DBC start bit); length and endian come from the pool signal definition.
                            </p>
                            <div class="signals-toolbar">
                                {#if onNavigateToSignals}
                                    <button type="button" class="dbc-link sm-link" onclick={() => onNavigateToSignals()}>
                                        Open Signals tab →
                                    </button>
                                {/if}
                                <label class="link-pick">
                                    <span class="sr-only">Signal from pool</span>
                                    <select bind:value={linkPick} title="Signals must exist in the pool">
                                        <option value="">Add from pool…</option>
                                        {#each poolSignalsNotOnFrame as s}
                                            <option value={s.name}>{s.name}</option>
                                        {/each}
                                    </select>
                                </label>
                                <label class="inline-start">
                                    <span>Start</span>
                                    <input
                                        type="number"
                                        class="sig-start-input"
                                        bind:value={linkStartBit}
                                        min="0"
                                        max={maxPayloadBitIndex}
                                        title="Start bit when adding this signal to the frame"
                                    />
                                </label>
                                <button
                                    type="button"
                                    class="btn btn-primary btn-compact"
                                    onclick={linkPoolSignalToSelectedMessage}
                                    disabled={!linkPick || poolSignalsNotOnFrame.length === 0}
                                >
                                    Add
                                </button>
                                <button
                                    type="button"
                                    class="btn danger btn-compact"
                                    onclick={removeSignalFromSelectedMessage}
                                    disabled={selectedSignalName === null}
                                >
                                    Remove
                                </button>
                            </div>
                            <div class="table-area signals-table-wrap">
                                <div class="signals-table-scroll">
                                    <table class="signals-table">
                                        <thead>
                                            <tr>
                                                <th class="col-name">Signal</th>
                                                <th class="col-start">Start</th>
                                                <th class="col-bits">Bits</th>
                                                <th class="col-endian">Endian</th>
                                                <th class="col-unit">Unit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#if msg.signals.length === 0}
                                                <tr>
                                                    <td colspan="5" class="cell-empty">No signals linked — add from pool</td>
                                                </tr>
                                            {:else}
                                                {#each msg.signals as s, si}
                                                    <tr
                                                        class:selected={selectedSignalIndex === si}
                                                        onclick={() => {
                                                            selectedSignalIndex = si;
                                                            selectedSignalName = s.name;
                                                        }}
                                                    >
                                                        <td class="cell-name">
                                                            {#if onNavigateToSignal}
                                                                <button
                                                                    type="button"
                                                                    class="dbc-link row-link"
                                                                    onclick={(e) => {
                                                                        e.stopPropagation();
                                                                        onNavigateToSignal(msg.id, s.name);
                                                                    }}
                                                                >
                                                                    {s.name}
                                                                </button>
                                                            {:else}
                                                                {s.name}
                                                            {/if}
                                                        </td>
                                                        <td class="cell-start">
                                                            <input
                                                                type="number"
                                                                class="sig-start-input"
                                                                min="0"
                                                                max={maxPayloadBitIndex}
                                                                value={s.startBit}
                                                                title="DBC start bit for this frame"
                                                                onclick={(e) => e.stopPropagation()}
                                                                onchange={(e) =>
                                                                    onSignalStartBitChange(
                                                                        s.name,
                                                                        Number((e.currentTarget as HTMLInputElement).value),
                                                                    )}
                                                            />
                                                        </td>
                                                        <td class="cell-mono">{s.bitLength}</td>
                                                        <td class="cell-mono">
                                                            {s.byteOrder === 'little_endian' ? 'Intel' : 'Motorola'}
                                                        </td>
                                                        <td class="cell-mono">{s.unit || '—'}</td>
                                                    </tr>
                                                {/each}
                                            {/if}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        {:else if messageDetailTab === 'transmitters'}
                            <p class="tab-hint">
                                DBC allows one transmitting ECU per message (<code>BO_</code> sender). Pick a node from
                                the network or type a name (creates a <code>BU_</code> entry if new).
                            </p>
                            <div class="ecu-table-wrap">
                                <table class="ecu-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Address</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#if msg.transmitter}
                                            <tr>
                                                <td class="cell-name">
                                                    {#if transmitterKnown && onGotoNode}
                                                        <button type="button" class="dbc-link row-link" onclick={() => onGotoNode(msg.transmitter)}>
                                                            {msg.transmitter}
                                                        </button>
                                                    {:else}
                                                        {msg.transmitter}
                                                    {/if}
                                                </td>
                                                <td class="cell-muted">—</td>
                                                <td class="cell-actions">
                                                    <button type="button" class="btn danger btn-compact" onclick={clearTransmitter}>
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        {:else}
                                            <tr>
                                                <td colspan="3" class="cell-empty">No transmitter set — use the fields below.</td>
                                            </tr>
                                        {/if}
                                    </tbody>
                                </table>
                            </div>
                            <div class="tx-field">
                                <span class="tx-label">Set transmitter (ECU)</span>
                                <div class="tx-row">
                                    <select
                                        class="tx-select"
                                        bind:value={quickPickTx}
                                        onchange={applyQuickPickTransmitter}
                                        title="Choose an existing network node"
                                    >
                                        <option value="">Add from list…</option>
                                        {#each sortedNodeNames as n}
                                            <option value={n}>{n}</option>
                                        {/each}
                                    </select>
                                    <input
                                        class="tx-input"
                                        type="text"
                                        list="tx-ecu-datalist-{msg.id}"
                                        placeholder="ECU name"
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
                            </div>
                        {:else if messageDetailTab === 'receivers'}
                            <p class="tab-hint">
                                ECUs that receive this message, aggregated from each signal’s receiver list
                                (<code>SG_</code> … receivers). Edit receivers on each signal in the Signals tab.
                            </p>
                            <div class="ecu-table-wrap">
                                <table class="ecu-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Address</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each messageReceiverNodes as name}
                                            <tr>
                                                <td class="cell-name">
                                                    {#if onGotoNode && nodes.some((n) => n.name === name)}
                                                        <button type="button" class="dbc-link row-link" onclick={() => onGotoNode(name)}>
                                                            {name}
                                                        </button>
                                                    {:else}
                                                        {name}
                                                    {/if}
                                                </td>
                                                <td class="cell-muted">—</td>
                                            </tr>
                                        {:else}
                                            <tr>
                                                <td colspan="2" class="cell-empty">
                                                    No receivers — add receiver nodes on the signals in this frame.
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {:else if messageDetailTab === 'layout'}
                            <p class="tab-hint">Visual map of signal bits in the payload (start bit and length from each signal definition).</p>
                            <div class="layout-bit-wrap">
                                <BitLayoutView message={msg} onNavigateToSignal={onNavigateToSignal} />
                            </div>
                        {:else if messageDetailTab === 'attributes'}
                            <p class="empty-tab">
                                Message-level attribute instances are not edited in the visual database view yet. Use the
                                text editor or extend serialization later.
                            </p>
                        {:else if messageDetailTab === 'comment'}
                            <label class="comment-block">
                                <span class="tx-label">Comment</span>
                                <textarea
                                    class="comment-text"
                                    rows={8}
                                    bind:value={commentDraft}
                                    onblur={commitComment}
                                    placeholder="Documentation for this message…"
                                ></textarea>
                            </label>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="detail-placeholder">
                    Select a message in the list to edit definition, signals, transmitters, and layout.
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

    .message-detail-card {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .detail-title-row {
        font-size: 13px;
        font-weight: 600;
    }

    .detail-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .message-tabs {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px 0;
        border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    }

    .message-tabs button {
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

    .message-tabs button:hover {
        color: var(--vscode-tab-activeForeground);
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
    }

    .message-tabs button.active {
        color: var(--vscode-tab-activeForeground);
        border-bottom-color: var(--vscode-focusBorder);
        font-weight: 600;
    }

    .message-tab-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .tab-hint {
        margin: 0 0 12px 0;
        font-size: 11px;
        line-height: 1.45;
        color: var(--vscode-descriptionForeground);
    }

    .tab-hint code {
        font-size: 10px;
    }

    .empty-tab {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground);
    }

    .signals-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
    }

    .ecu-table-wrap {
        overflow-x: auto;
        margin-bottom: 14px;
    }

    .ecu-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .ecu-table th,
    .ecu-table td {
        padding: 8px 10px;
        text-align: left;
        border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
    }

    .ecu-table th {
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--vscode-descriptionForeground);
    }

    .cell-name {
        font-weight: 500;
    }

    .cell-muted {
        color: var(--vscode-descriptionForeground);
        font-family: var(--vscode-editor-font-family);
    }

    .cell-empty {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
    }

    .cell-actions {
        text-align: right;
        white-space: nowrap;
    }

    .row-link {
        font: inherit;
        padding: 0;
        background: none;
        border: none;
        cursor: pointer;
    }

    .layout-bit-wrap {
        min-height: 120px;
    }

    .layout-bit-wrap :global(.bit-layout) {
        margin-top: 0;
    }

    .comment-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .comment-text {
        width: 100%;
        box-sizing: border-box;
        min-height: 120px;
        padding: 8px 10px;
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 6px;
        resize: vertical;
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

    .tx-field {
        margin-bottom: 0;
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

    .signals-table-wrap {
        min-height: 120px;
    }

    .signals-table-scroll {
        overflow: auto;
        border: 1px solid var(--vscode-widget-border, #444);
        border-radius: 6px;
    }

    .signals-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .signals-table th,
    .signals-table td {
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
    }

    .signals-table th {
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background));
        white-space: nowrap;
    }

    .signals-table tbody tr {
        cursor: pointer;
    }

    .signals-table tbody tr:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .signals-table tbody tr.selected {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .signals-table .cell-mono {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
    }

    .signals-table .cell-start {
        width: 88px;
    }

    .sig-start-input {
        width: 4.5rem;
        max-width: 100%;
        padding: 3px 6px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 4px;
        box-sizing: border-box;
    }

    .sig-start-input:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }

    .inline-start {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
    }

    .inline-start span {
        white-space: nowrap;
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

    .sm-link {
        font-size: 12px;
    }

    .btn-compact {
        padding: 4px 10px;
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
