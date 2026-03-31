<script lang="ts">
    /**
     * Network nodes with related messages (Tx) and signals (Rx).
     */
    import { tick } from 'svelte';
    import { get } from 'svelte/store';
    import type { MessageDescriptor, NodeDescriptor } from '../../types';
    import DataTable from '../shared/DataTable.svelte';
    import PropertyGrid from '../shared/PropertyGrid.svelte';
    import { vscode } from '../../vscode';
    import { documentUri } from '../../stores/editorContext';

    interface Props {
        nodes: NodeDescriptor[];
        messages: MessageDescriptor[];
        focusNodeName?: string | null;
        onFocusConsumed?: () => void;
        onGotoMessage?: (messageId: number) => void;
    }

    let {
        nodes,
        messages,
        focusNodeName = null,
        onFocusConsumed,
        onGotoMessage,
    }: Props = $props();

    let selectedIndex: number | null = $state(null);
    let newNodeName = $state('');

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

    let txMessages = $derived.by(() => {
        if (!selectedNode) return [];
        return messages.filter((m) => m.transmitter === selectedNode.name);
    });

    let rxSignals = $derived.by(() => {
        if (!selectedNode) return [] as { message: MessageDescriptor; signalName: string }[];
        const out: { message: MessageDescriptor; signalName: string }[] = [];
        for (const m of messages) {
            for (const s of m.signals) {
                if (s.receivers?.includes(selectedNode.name)) {
                    out.push({ message: m, signalName: s.name });
                }
            }
        }
        return out;
    });

    let detailProps = $derived(
        selectedNode
            ? [
                  { key: 'name', label: 'Name', value: selectedNode.name, type: 'text' as const },
                  { key: 'comment', label: 'Comment', value: selectedNode.comment, type: 'text' as const },
              ]
            : [],
    );

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
                <div class="detail-panel dbc-card">
                    <div class="dbc-card-header">
                        <span>{selectedNode.name}</span>
                        <span class="dbc-subtle">ECU / network node</span>
                    </div>
                    <div class="dbc-card-body">
                        <div class="relations">
                    <div class="rel-block">
                        <h4>Transmits (messages)</h4>
                        {#if txMessages.length === 0}
                            <p class="empty-rel">No messages list this node as transmitter.</p>
                        {:else}
                            <ul class="rel-list">
                                {#each txMessages as m}
                                    <li>
                                        {#if onGotoMessage}
                                            <button
                                                type="button"
                                                class="dbc-link"
                                                onclick={() => onGotoMessage(m.id)}
                                            >
                                                {m.name}
                                            </button>
                                        {:else}
                                            {m.name}
                                        {/if}
                                        <span class="meta">
                                            0x{m.id.toString(16).toUpperCase()} · {m.signals.length} signals
                                        </span>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                    <div class="rel-block">
                        <h4>Receives (signals)</h4>
                        {#if rxSignals.length === 0}
                            <p class="empty-rel">No signals list this node as receiver.</p>
                        {:else}
                            <ul class="rel-list">
                                {#each rxSignals as rx}
                                    <li>
                                        <span class="sig">{rx.signalName}</span>
                                        <span class="meta">in {rx.message.name}</span>
                                        {#if onGotoMessage}
                                            <button
                                                type="button"
                                                class="dbc-link small"
                                                onclick={() => onGotoMessage(rx.message.id)}
                                            >
                                                open message
                                            </button>
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    </div>
                </div>

                        <h4 class="props-head">Properties</h4>
                        <PropertyGrid properties={detailProps} onChange={onPropertyChange} />
                    </div>
                </div>
            {:else}
                <div class="detail-placeholder">
                    Select a node in the list to see transmit/receive relations and edit properties.
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

    .relations {
        display: grid;
        grid-template-columns: minmax(200px, 1fr) minmax(200px, 1fr);
        gap: 16px;
        margin-bottom: 16px;
    }

    @media (max-width: 700px) {
        .relations {
            grid-template-columns: 1fr;
        }
    }

    .rel-block h4 {
        margin: 0 0 8px 0;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground);
    }

    .rel-list {
        margin: 0;
        padding: 0 0 0 16px;
        font-size: 12px;
        line-height: 1.5;
    }

    .rel-list li {
        margin-bottom: 6px;
    }

    .meta {
        display: inline-block;
        margin-left: 6px;
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
    }

    .sig {
        font-weight: 600;
        font-family: var(--vscode-editor-font-family, monospace);
    }

    .empty-rel {
        margin: 0;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
    }

    .props-head {
        margin: 0 0 8px 0;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground);
    }

    .dbc-link.small {
        font-size: 11px;
        margin-left: 8px;
    }
</style>
