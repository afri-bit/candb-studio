<script lang="ts">
    /**
     * In-webview architecture: extension layers (static) + CAN network from the loaded DBC (nodes + messages by transmitter).
     */
    import type { MessageDescriptor, NodeDescriptor } from '../../types';

    interface Props {
        nodes: NodeDescriptor[];
        messages: MessageDescriptor[];
        /** Optional: jump to Messages tab with this frame selected. */
        onSelectMessage?: (messageId: number) => void;
        /** Optional: jump to Nodes tab with this ECU focused. */
        onSelectNode?: (nodeName: string) => void;
    }

    let { nodes, messages, onSelectMessage, onSelectNode }: Props = $props();

    let sortedNodes = $derived(
        [...nodes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    );

    type MsgGroup = {
        key: string;
        title: string;
        subtitle?: string;
        messages: MessageDescriptor[];
    };

    let networkGroups = $derived.by(() => {
        const byTx = new Map<string, MessageDescriptor[]>();
        for (const m of messages) {
            const tx = m.transmitter?.trim() ?? '';
            const key = tx.length > 0 ? tx : '—';
            if (!byTx.has(key)) byTx.set(key, []);
            byTx.get(key)!.push(m);
        }
        for (const list of byTx.values()) {
            list.sort((a, b) => a.id - b.id);
        }

        const nodeNameSet = new Set(nodes.map((n) => n.name));
        const groups: MsgGroup[] = [];

        for (const node of sortedNodes) {
            const list = byTx.get(node.name) ?? [];
            groups.push({
                key: `node:${node.name}`,
                title: node.name,
                subtitle: node.comment?.trim() || undefined,
                messages: list,
            });
        }

        const extraKeys = [...byTx.keys()].filter((k) => k !== '—' && !nodeNameSet.has(k));
        extraKeys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        for (const k of extraKeys) {
            groups.push({
                key: `tx:${k}`,
                title: k,
                subtitle: 'Transmitter set on message, but not in the BU_ node list',
                messages: byTx.get(k) ?? [],
            });
        }

        const unassigned = byTx.get('—') ?? [];
        if (unassigned.length > 0) {
            groups.push({
                key: 'unassigned',
                title: 'No transmitter',
                subtitle: 'Frames with an empty transmitter field',
                messages: unassigned,
            });
        }

        return groups;
    });

    function idHex(id: number): string {
        return `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
    }
</script>

<div class="arch-view">
    <section class="arch-section dbc-card">
        <div class="dbc-card-header">
            <span>Extension design</span>
            <span class="dbc-subtle">How this VS Code extension is layered around your database</span>
        </div>
        <div class="dbc-card-body ext-flow-body">
            <p class="ext-intro">
                The custom editor loads your <code>.dbc</code> into a <strong>CanDatabase</strong> model. The webview and sidebar
                talk to <strong>CanDatabaseService</strong>; parsing and serialization live in the infrastructure layer. Bus
                monitor and transmit plug in when a hardware adapter is connected.
            </p>
            <div class="ext-flow" aria-hidden="true">
                <div class="ext-row">
                    <div class="ext-box">
                        <span class="ext-box-title">Presentation</span>
                        <span class="ext-box-body">Custom editor, webview UI, tree view, language features</span>
                    </div>
                    <span class="ext-arrow">→</span>
                    <div class="ext-box">
                        <span class="ext-box-title">Application</span>
                        <span class="ext-box-body">CanDatabaseService, validation, monitor &amp; transmit</span>
                    </div>
                    <span class="ext-arrow">→</span>
                    <div class="ext-box">
                        <span class="ext-box-title">Domain</span>
                        <span class="ext-box-body">CanDatabase, messages, signal pool, value tables</span>
                    </div>
                    <span class="ext-arrow">→</span>
                    <div class="ext-box">
                        <span class="ext-box-title">Infrastructure</span>
                        <span class="ext-box-body">DBC parser &amp; serializer, filesystem, signal codec</span>
                    </div>
                </div>
                <div class="ext-bus">
                    <span class="ext-bus-label">Optional</span>
                    <div class="ext-bus-line"></div>
                    <div class="ext-box ext-box-narrow">
                        <span class="ext-box-title">CAN adapter</span>
                        <span class="ext-box-body">Decode live frames; transmit when connected</span>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section class="arch-section dbc-card">
        <div class="dbc-card-header">
            <span>Network in this database</span>
            <span class="dbc-subtle">BU_ nodes and frames grouped by transmitter (DBC)</span>
        </div>
        <div class="dbc-card-body net-body">
            {#if nodes.length === 0 && messages.length === 0}
                <p class="empty-hint">No nodes or messages yet. Define nodes and frames in the Nodes and Messages tabs.</p>
            {:else}
                <div class="node-grid">
                    {#each networkGroups as g (g.key)}
                        <article class="node-card">
                            <header class="node-card-head">
                                <h3 class="node-title">{g.title}</h3>
                                {#if g.key.startsWith('node:')}
                                    <button
                                        type="button"
                                        class="dbc-link sm"
                                        title="Open Nodes tab"
                                        onclick={() => onSelectNode?.(g.title)}
                                    >
                                        Nodes →
                                    </button>
                                {/if}
                            </header>
                            {#if g.subtitle}
                                <p class="node-comment">{g.subtitle}</p>
                            {/if}
                            {#if g.messages.length === 0}
                                <p class="node-empty">No frames with this transmitter.</p>
                            {:else}
                                <ul class="msg-list">
                                    {#each g.messages as m (m.id)}
                                        <li>
                                            <button
                                                type="button"
                                                class="msg-line"
                                                title="Open Messages tab and select this frame"
                                                onclick={() => onSelectMessage?.(m.id)}
                                            >
                                                <span class="msg-name">{m.name}</span>
                                                <span class="msg-meta">{idHex(m.id)} · DLC {m.dlc}</span>
                                            </button>
                                        </li>
                                    {/each}
                                </ul>
                            {/if}
                        </article>
                    {/each}
                </div>
            {/if}
        </div>
    </section>
</div>

<style>
    .arch-view {
        display: flex;
        flex-direction: column;
        gap: 16px;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-right: 4px;
    }

    .arch-section {
        flex-shrink: 0;
    }

    .ext-flow-body {
        padding-top: 10px;
    }

    .ext-intro {
        margin: 0 0 14px 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--vscode-descriptionForeground);
    }

    .ext-intro code {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
    }

    .ext-flow {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .ext-row {
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        gap: 8px;
        justify-content: flex-start;
    }

    .ext-box {
        flex: 1 1 140px;
        min-width: 120px;
        max-width: 220px;
        padding: 10px 12px;
        border-radius: var(--dbc-radius-sm, 6px);
        border: 1px solid var(--dbc-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-list-hoverBackground));
    }

    .ext-box-narrow {
        max-width: 280px;
        flex: 0 1 auto;
    }

    .ext-box-title {
        display: block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 6px;
    }

    .ext-box-body {
        display: block;
        font-size: 12px;
        line-height: 1.45;
    }

    .ext-arrow {
        align-self: center;
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
        padding: 0 2px;
    }

    .ext-bus {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding-top: 4px;
        border-top: 1px dashed var(--dbc-border);
    }

    .ext-bus-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--vscode-descriptionForeground);
    }

    .ext-bus-line {
        flex: 1;
        min-width: 40px;
        height: 1px;
        background: color-mix(in srgb, var(--vscode-focusBorder) 45%, transparent);
    }

    .net-body {
        padding-top: 10px;
    }

    .empty-hint {
        margin: 0;
        font-size: 13px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
    }

    .node-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
    }

    .node-card {
        border: 1px solid var(--dbc-border);
        border-radius: var(--dbc-radius-sm, 6px);
        padding: 12px 14px;
        background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-sideBar-background));
        min-width: 0;
    }

    .node-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
    }

    .node-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        word-break: break-word;
    }

    .node-comment {
        margin: 0 0 10px 0;
        font-size: 11px;
        line-height: 1.4;
        color: var(--vscode-descriptionForeground);
    }

    .node-empty {
        margin: 0;
        font-size: 12px;
        font-style: italic;
        color: var(--vscode-descriptionForeground);
    }

    .msg-list {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .msg-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 6px;
        width: 100%;
        text-align: left;
        padding: 6px 8px;
        margin: 0 -8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
    }

    .msg-line:hover {
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 80%, transparent);
    }

    .msg-name {
        font-weight: 600;
        font-size: 12px;
    }

    .msg-meta {
        font-size: 11px;
        font-family: var(--vscode-editor-font-family, monospace);
        color: var(--vscode-descriptionForeground);
    }

    .sm {
        font-size: 11px;
    }

    @media (max-width: 720px) {
        .ext-row .ext-arrow {
            display: none;
        }

        .ext-box {
            max-width: none;
        }
    }
</style>
