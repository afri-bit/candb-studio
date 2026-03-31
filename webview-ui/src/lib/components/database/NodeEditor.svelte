<script lang="ts">
    /**
     * Network nodes (BU_): tabbed definition, mapped Tx/Rx signals, Tx messages, networks, comment.
     */
    import { tick } from 'svelte';
    import { get } from 'svelte/store';
    import type { MessageDescriptor, NodeDescriptor, SignalDescriptor } from '../../types';
    import DataTable from '../shared/DataTable.svelte';
    import PropertyGrid from '../shared/PropertyGrid.svelte';
    import { vscode } from '../../vscode';
    import { documentUri } from '../../stores/editorContext';

    interface Props {
        nodes: NodeDescriptor[];
        messages: MessageDescriptor[];
        /** DBC version string — shown under Networks. */
        version?: string;
        focusNodeName?: string | null;
        onFocusConsumed?: () => void;
        onGotoMessage?: (messageId: number) => void;
    }

    let {
        nodes,
        messages,
        version = '',
        focusNodeName = null,
        onFocusConsumed,
        onGotoMessage,
    }: Props = $props();

    type NodeDetailTab =
        | 'definition'
        | 'mappedTx'
        | 'mappedRx'
        | 'txMessages'
        | 'networks'
        | 'controlUnits'
        | 'attributes'
        | 'comment';

    let selectedIndex: number | null = $state(null);
    let newNodeName = $state('');
    let nodeTab = $state<NodeDetailTab>('definition');
    let commentDraft = $state('');

    const columns = [
        { key: 'name', label: 'Node', width: '200px' },
        { key: 'comment', label: 'Comment' },
    ];

    let rows = $derived(
        nodes.map((n) => ({
            name: n.name,
            comment: n.comment,
        })),
    );

    let selectedNode = $derived(
        selectedIndex !== null ? nodes[selectedIndex] ?? null : null,
    );

    let nodeTitle = $derived(selectedNode ? `Node '${selectedNode.name}'` : '');

    function receiverMatchesNode(signal: SignalDescriptor, nodeName: string): boolean {
        return signal.receivers?.some((r) => r.trim() === nodeName) ?? false;
    }

    let txMessages = $derived.by(() => {
        if (!selectedNode) return [];
        return messages.filter((m) => m.transmitter === selectedNode.name);
    });

    /** Signals carried on frames this node transmits. */
    type MappedRow = {
        signal: string;
        message: string;
        messageId: number;
        multiplex: string;
        startBit: number;
        length: number;
        endian: string;
        valueType: string;
    };

    let mappedTxRows = $derived.by((): MappedRow[] => {
        if (!selectedNode) return [];
        const out: MappedRow[] = [];
        for (const m of messages) {
            if (m.transmitter !== selectedNode.name) continue;
            for (const s of m.signals) {
                out.push(mappedRowFromSignal(m, s));
            }
        }
        return out;
    });

    let mappedRxRows = $derived.by((): MappedRow[] => {
        if (!selectedNode) return [];
        const out: MappedRow[] = [];
        for (const m of messages) {
            for (const s of m.signals) {
                if (receiverMatchesNode(s, selectedNode!.name)) {
                    out.push(mappedRowFromSignal(m, s));
                }
            }
        }
        return out;
    });

    function mappedRowFromSignal(m: MessageDescriptor, s: SignalDescriptor): MappedRow {
        return {
            signal: s.name,
            message: m.name,
            messageId: m.id,
            multiplex: formatMultiplex(s),
            startBit: s.startBit,
            length: s.bitLength,
            endian: s.byteOrder === 'little_endian' ? 'Intel' : 'Motorola',
            valueType: valueTypeLabel(s),
        };
    }

    function formatMultiplex(sig: SignalDescriptor): string {
        const m = sig.multiplex;
        if (m === 'none') return '—';
        if (m === 'multiplexor') return 'Multiplexor';
        return `Mux ${m}`;
    }

    function valueTypeLabel(s: SignalDescriptor): string {
        if (s.valueType === 'float') return 'Float';
        if (s.valueType === 'double') return 'Double';
        return s.isSigned ? 'Signed' : 'Unsigned';
    }

    const mappedColumns = [
        { key: 'signal', label: 'Signal', width: '140px' },
        { key: 'message', label: 'Message', width: '120px' },
        { key: 'multiplex', label: 'Multiplexing', width: '100px' },
        { key: 'startBit', label: 'Start bit', width: '72px' },
        { key: 'length', label: 'Length [bit]', width: '80px' },
        { key: 'endian', label: 'Byte order', width: '88px' },
        { key: 'valueType', label: 'Value type', width: '88px' },
    ];

    let mappedTxTableRows = $derived(
        mappedTxRows.map((r) => ({
            signal: r.signal,
            message: r.message,
            multiplex: r.multiplex,
            startBit: r.startBit,
            length: r.length,
            endian: r.endian,
            valueType: r.valueType,
            _messageId: r.messageId,
        })),
    );

    let mappedRxTableRows = $derived(
        mappedRxRows.map((r) => ({
            signal: r.signal,
            message: r.message,
            multiplex: r.multiplex,
            startBit: r.startBit,
            length: r.length,
            endian: r.endian,
            valueType: r.valueType,
            _messageId: r.messageId,
        })),
    );

    const txMsgColumns = [
        { key: 'name', label: 'Name', width: '160px' },
        { key: 'idHex', label: 'ID', width: '100px' },
        { key: 'dlc', label: 'DLC', width: '48px' },
        { key: 'sigCount', label: 'Signals', width: '72px' },
    ];

    let txMsgRows = $derived(
        txMessages.map((m) => ({
            messageId: m.id,
            name: m.name,
            idHex: `0x${m.id.toString(16).toUpperCase()}`,
            dlc: m.dlc,
            sigCount: m.signals.length,
        })),
    );

    let definitionProps = $derived(
        selectedNode
            ? [{ key: 'name', label: 'Name', value: selectedNode.name, type: 'text' as const }]
            : [],
    );

    let networkLabel = $derived(version.trim() || 'Default');

    $effect(() => {
        const n = selectedNode;
        commentDraft = n?.comment ?? '';
    });

    $effect(() => {
        selectedIndex;
        nodeTab = 'definition';
    });

    function onPropertyChange(key: string, value: string | number | boolean) {
        if (!selectedNode) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'updateNode',
            payload: {
                documentUri: uri,
                nodeName: selectedNode.name,
                changes: { [key]: value },
            },
        });
    }

    function commitComment() {
        if (!selectedNode) return;
        const cur = selectedNode.comment ?? '';
        if (commentDraft === cur) return;
        onPropertyChange('comment', commentDraft);
    }

    function addNode() {
        const name = newNodeName.trim();
        if (!name) return;
        if (nodes.some((n) => n.name === name)) {
            return;
        }
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'addNode',
            payload: { documentUri: uri, name },
        });
        newNodeName = '';
    }

    const detailTabs: { id: NodeDetailTab; label: string }[] = [
        { id: 'definition', label: 'Definition' },
        { id: 'mappedTx', label: 'Mapped Tx Sig.' },
        { id: 'mappedRx', label: 'Mapped Rx Sig.' },
        { id: 'txMessages', label: 'Tx Messages' },
        { id: 'networks', label: 'Networks' },
        { id: 'controlUnits', label: 'Control units' },
        { id: 'attributes', label: 'Attributes' },
        { id: 'comment', label: 'Comment' },
    ];

    $effect(() => {
        const name = focusNodeName;
        if (!name) return;
        void (async () => {
            await tick();
            const idx = nodes.findIndex((n) => n.name === name);
            selectedIndex = idx >= 0 ? idx : null;
            onFocusConsumed?.();
        })();
    });
</script>

<div class="node-editor">
    <div class="toolbar">
        <input
            class="node-input"
            type="text"
            placeholder="New node (ECU) name"
            bind:value={newNodeName}
            onkeydown={(e) => e.key === 'Enter' && addNode()}
        />
        <button type="button" class="btn btn-primary" onclick={addNode} disabled={!newNodeName.trim()}>
            Add node
        </button>
    </div>

    <div class="editor-split">
        <section class="list-pane" aria-label="Node list">
            <div class="table-area dbc-card">
                <DataTable
                    {columns}
                    {rows}
                    {selectedIndex}
                    onSelect={(i) => (selectedIndex = i)}
                    emptyText="No nodes defined"
                />
            </div>
        </section>
        <section class="detail-pane" aria-label="Node details">
            {#if selectedNode}
                <div class="detail-panel dbc-card node-detail-card">
                    <div class="dbc-card-header detail-title-row">
                        <span class="detail-title">{nodeTitle}</span>
                        <span class="dbc-subtle">ECU / BU_</span>
                    </div>

                    <div class="node-tabs" role="tablist" aria-label="Node sections">
                        {#each detailTabs as t}
                            <button
                                type="button"
                                role="tab"
                                class:active={nodeTab === t.id}
                                aria-selected={nodeTab === t.id}
                                onclick={() => (nodeTab = t.id)}
                            >
                                {t.label}
                            </button>
                        {/each}
                    </div>

                    <div class="dbc-card-body node-tab-body">
                        {#if nodeTab === 'definition'}
                            <p class="tab-hint">Node name in the DBC <code>BU_</code> list. Renaming updates references where possible.</p>
                            <PropertyGrid properties={definitionProps} onChange={onPropertyChange} />
                        {:else if nodeTab === 'mappedTx'}
                            <p class="tab-hint">
                                Signals in frames transmitted by this node (<code>BO_</code> sender = this node). Bit layout
                                comes from each message’s signal mapping.
                            </p>
                            <div class="mapped-toolbar">
                                <button type="button" class="btn btn-disabled" disabled title="Edit mappings in Messages → Signals"
                                    >Add: individual signal</button
                                >
                                <button type="button" class="btn btn-disabled" disabled title="Link signals via Messages tab"
                                    >Add: all from one message</button
                                >
                                <button type="button" class="btn btn-disabled" disabled title="Unlink via message frame">Remove</button
                                >
                            </div>
                            <div class="table-wrap">
                                <DataTable
                                    columns={mappedColumns}
                                    rows={mappedTxTableRows}
                                    emptyText="No mapped Tx signals — set this node as transmitter on a message, then add signals to that frame"
                                />
                            </div>
                            {#if mappedTxTableRows.length > 0}
                                <p class="footer-hint">
                                    Edit mappings in the <strong>Messages</strong> and <strong>Signals</strong> tabs.
                                </p>
                            {/if}
                        {:else if nodeTab === 'mappedRx'}
                            <p class="tab-hint">
                                Signals this node receives (aggregated from each <code>SG_</code> receiver list). Editing
                                receivers is done per signal in the <strong>Signals</strong> tab.
                            </p>
                            <div class="mapped-toolbar">
                                <button type="button" class="btn btn-disabled" disabled title="Add receiver on the signal definition"
                                    >Add: individual signal</button
                                >
                                <button type="button" class="btn btn-disabled" disabled title="Bulk-edit receivers via signal pool"
                                    >Add: all from one message</button
                                >
                                <button type="button" class="btn btn-disabled" disabled title="Edit SG_ receivers on the signal"
                                    >Remove</button
                                >
                            </div>
                            <div class="table-wrap">
                                <DataTable
                                    columns={mappedColumns}
                                    rows={mappedRxTableRows}
                                    emptyText="No mapped Rx signals — add this node as a receiver on a signal (Signals tab)"
                                />
                            </div>
                        {:else if nodeTab === 'txMessages'}
                            <p class="tab-hint">Frames where this node is the <code>BO_</code> transmitter.</p>
                            <div class="table-wrap">
                                <DataTable
                                    columns={txMsgColumns}
                                    rows={txMsgRows}
                                    onSelect={(_i, row) => onGotoMessage?.(row.messageId as number)}
                                    emptyText="No transmit messages — set Transmitter on a message in the Messages tab"
                                />
                            </div>
                            {#if txMsgRows.length > 0 && onGotoMessage}
                                <p class="footer-hint">Click a row to open that message in the <strong>Messages</strong> tab.</p>
                            {/if}
                        {:else if nodeTab === 'networks'}
                            <p class="tab-hint">
                                This DBC describes a single logical network. The version string is taken from the file header.
                            </p>
                            <div class="network-box">
                                <span class="network-label">Network</span>
                                <span class="network-value">{networkLabel}</span>
                            </div>
                        {:else if nodeTab === 'controlUnits'}
                            <p class="tab-hint">
                                In CANdb, <strong>BU_</strong> entries are network nodes (ECUs). This node is one control unit
                                in the database; there is no separate “control unit” object beyond the node definition.
                            </p>
                            <ul class="cu-list">
                                <li><strong>Name:</strong> {selectedNode.name}</li>
                                <li>
                                    <strong>Transmit messages:</strong>
                                    {txMessages.length}
                                </li>
                                <li>
                                    <strong>Receive mappings (signals):</strong>
                                    {mappedRxRows.length}
                                </li>
                            </ul>
                        {:else if nodeTab === 'attributes'}
                            <p class="empty-tab">
                                Node-level attribute instances are not edited in the visual database view yet. Use the text
                                editor for <code>BA_</code> / <code>CM_</code> on nodes, or extend the serializer later.
                            </p>
                        {:else if nodeTab === 'comment'}
                            <label class="comment-block">
                                <span class="field-label">Comment</span>
                                <textarea
                                    class="comment-text"
                                    rows={10}
                                    bind:value={commentDraft}
                                    onblur={commitComment}
                                    placeholder="Documentation for this node…"
                                ></textarea>
                            </label>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="detail-placeholder">
                    Select a node in the list to edit definition, mapped signals, and transmit frames.
                </div>
            {/if}
        </section>
    </div>
</div>

<style>
    .node-editor {
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
        max-width: 480px;
        min-width: 200px;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .detail-pane {
        flex: 1;
        min-width: 260px;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .node-detail-card {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .detail-title-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
    }

    .detail-title {
        font-size: 13px;
        font-weight: 600;
    }

    .node-tabs {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px 0;
        border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    }

    .node-tabs button {
        padding: 6px 10px;
        border: none;
        background: transparent;
        color: var(--vscode-tab-inactiveForeground);
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        border-radius: 6px 6px 0 0;
        border-bottom: 2px solid transparent;
    }

    .node-tabs button:hover {
        color: var(--vscode-tab-activeForeground);
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
    }

    .node-tabs button.active {
        color: var(--vscode-tab-activeForeground);
        border-bottom-color: var(--vscode-focusBorder);
        font-weight: 600;
    }

    .node-tab-body {
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

    .mapped-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
    }

    .btn-disabled:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .table-wrap {
        min-height: 120px;
        overflow: auto;
    }

    .footer-hint {
        margin: 10px 0 0 0;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
    }

    .network-box {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
        background: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-list-hoverBackground));
        max-width: 400px;
    }

    .network-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--vscode-descriptionForeground);
    }

    .network-value {
        font-size: 14px;
        font-weight: 500;
    }

    .cu-list {
        margin: 0;
        padding-left: 18px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--vscode-foreground);
    }

    .comment-block {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .field-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--vscode-descriptionForeground);
    }

    .comment-text {
        width: 100%;
        box-sizing: border-box;
        min-height: 160px;
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

    .node-input {
        flex: 1;
        min-width: 160px;
        max-width: 320px;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--vscode-input-border, transparent);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-family: inherit;
        font-size: 13px;
    }

    .btn {
        padding: 6px 12px;
        cursor: pointer;
        border-radius: 6px;
        font-family: inherit;
        font-size: inherit;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    .btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-weight: 600;
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
    }

    .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
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
</style>
