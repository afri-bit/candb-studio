<script lang="ts">
    /**
     * Left sidebar: hierarchical "Overall view" (networks, ECUs, messages, signals, …).
     */
    import type {
        AttributeDescriptor,
        EnvironmentVariableDescriptor,
        MessageDescriptor,
        NodeDescriptor,
        SignalDescriptor,
    } from '../../types';

    interface Props {
        version: string;
        messages: MessageDescriptor[];
        signalPool: SignalDescriptor[];
        nodes: NodeDescriptor[];
        attributes: AttributeDescriptor[];
        environmentVariables: EnvironmentVariableDescriptor[];
        selectedMessageId: number | null;
        onSelectMessage: (id: number) => void;
        onSelectSignal: (signalName: string) => void;
        onSelectNode: (nodeName: string) => void;
        onSelectAttribute: (index: number) => void;
    }

    let {
        version,
        messages,
        signalPool,
        nodes,
        attributes,
        environmentVariables,
        selectedMessageId,
        onSelectMessage,
        onSelectSignal,
        onSelectNode,
        onSelectAttribute,
    }: Props = $props();

    let filter = $state('');

    const q = $derived(filter.trim().toLowerCase());

    function matches(text: string): boolean {
        if (!q) return true;
        return text.toLowerCase().includes(q);
    }

    let filteredMessages = $derived(
        messages.filter(
            (m) =>
                matches(m.name) ||
                matches(m.transmitter) ||
                matches(`0x${m.id.toString(16)}`) ||
                matches(String(m.id)),
        ),
    );

    let filteredSignals = $derived(signalPool.filter((s) => matches(s.name) || matches(s.unit)));

    let filteredNodes = $derived(nodes.filter((n) => matches(n.name) || matches(n.comment)));

    let filteredAttributeEntries = $derived(
        attributes
            .map((a, index) => ({ a, index }))
            .filter(({ a }) => matches(a.name) || matches(a.objectType)),
    );

    let filteredEnv = $derived(environmentVariables.filter((e) => matches(e.name)));

    /** Synthetic network label (DBC has no separate network object). */
    let networkLabel = $derived(version.trim() || 'Default');

    type SectionKey =
        | 'networks'
        | 'net'
        | 'net_tx'
        | 'net_sig'
        | 'ecus'
        | 'env'
        | 'netnodes'
        | 'msgs'
        | 'sigs'
        | 'attrs';

    let open = $state<Partial<Record<SectionKey, boolean>>>({
        networks: true,
        net: true,
        net_tx: true,
        net_sig: true,
        ecus: false,
        env: false,
        netnodes: true,
        msgs: true,
        sigs: true,
        attrs: false,
    });

    /** Expandable message → signals (id → expanded). */
    let msgSignalOpen = $state<Record<number, boolean>>({});
    /** Per network node: root / Tx / Rx sections. */
    let nnOpen = $state<Record<string, boolean>>({});
    /** ECUs section: expand to show node shortcut. */
    let ecuOpen = $state<Record<string, boolean>>({});

    function isOpen(key: SectionKey): boolean {
        return open[key] !== false;
    }

    function toggle(key: SectionKey) {
        open = { ...open, [key]: !isOpen(key) };
    }

    function nnK(nodeName: string, part: string): string {
        return `${nodeName}::${part}`;
    }

    function isNnOpen(nodeName: string, part: string): boolean {
        return nnOpen[nnK(nodeName, part)] === true;
    }

    function toggleNn(nodeName: string, part: string) {
        const k = nnK(nodeName, part);
        nnOpen = { ...nnOpen, [k]: !isNnOpen(nodeName, part) };
    }

    function toggleMsgSignals(messageId: number) {
        msgSignalOpen = {
            ...msgSignalOpen,
            [messageId]: !msgSignalOpen[messageId],
        };
    }

    function toggleEcuNode(name: string) {
        ecuOpen = { ...ecuOpen, [name]: !ecuOpen[name] };
    }

    function txMessagesForNode(nodeName: string): MessageDescriptor[] {
        return messages.filter((m) => m.transmitter === nodeName);
    }

    function rxMessagesForNode(nodeName: string): MessageDescriptor[] {
        return messages.filter((m) =>
            m.signals.some((s) => s.receivers?.some((r) => r.trim() === nodeName)),
        );
    }

    let filteredNodesForNet = $derived(
        nodes.filter(
            (n) =>
                matches(n.name) ||
                matches(n.comment) ||
                txMessagesForNode(n.name).some((m) => matches(m.name)) ||
                rxMessagesForNode(n.name).some((m) => matches(m.name)),
        ),
    );
</script>

<!-- Sprite: symbols referenced via <use> -->
<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true">
    <symbol id="sym-network" viewBox="0 0 16 16">
        <circle cx="4" cy="5" r="2" fill="var(--vscode-charts-red, #c44)" />
        <circle cx="12" cy="5" r="2" fill="var(--vscode-charts-red, #c44)" />
        <circle cx="8" cy="11" r="2" fill="var(--vscode-charts-red, #c44)" />
        <path
            d="M5.2 6.2 7 9.2M10.8 6.2 9 9.2M6.5 5h3"
            stroke="var(--vscode-foreground)"
            stroke-opacity="0.45"
            fill="none"
            stroke-width="0.9"
        />
    </symbol>
    <symbol id="sym-folder" viewBox="0 0 16 16">
        <path fill="var(--vscode-symbolIcon-folderForeground, #dcb67a)" d="M2 4h4l1 1h7v9H2V4zm1 2v6h10V7H2z" />
    </symbol>
    <symbol id="sym-message" viewBox="0 0 16 16">
        <path
            fill="var(--vscode-foreground)"
            fill-opacity="0.9"
            d="M2 4h12v8H2V4zm1 1 5 3.5L13 5V5H3zm0 1.2V11h10V6.3L8 10 3 6.2z"
        />
    </symbol>
    <symbol id="sym-signal" viewBox="0 0 16 16">
        <path
            fill="none"
            stroke="var(--vscode-foreground)"
            stroke-opacity="0.75"
            stroke-width="1.25"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M1.5 8 Q4.75 3.5 8 8 Q11.25 12.5 14.5 8"
        />
    </symbol>
    <symbol id="sym-node" viewBox="0 0 16 16">
        <rect x="3" y="5" width="10" height="7" rx="1" fill="var(--vscode-charts-red, #c44)" />
        <rect x="5" y="2" width="6" height="4" rx="0.5" fill="var(--vscode-charts-red, #d66)" />
        <line
            x1="8"
            y1="12"
            x2="8"
            y2="14"
            stroke="var(--vscode-foreground)"
            stroke-opacity="0.5"
            stroke-width="1.2"
        />
    </symbol>
    <symbol id="sym-env" viewBox="0 0 16 16">
        <path fill="var(--vscode-charts-purple, #c586c0)" d="M8 2 10 7h4l-3.5 3 1.5 5L8 12.5 3.5 15 5 10 1.5 7H6L8 2z" />
    </symbol>
    <symbol id="sym-attr" viewBox="0 0 16 16">
        <path fill="var(--vscode-symbolIcon-propertyForeground, #75beff)" d="M3 3h7l3 3v7H3V3zm1 2v8h7V7H8V5H4z" />
    </symbol>
</svg>

<div class="explorer">
    <div class="dbc-sidebar-header">Overall view</div>
    <div class="search">
        <input
            type="search"
            placeholder="Filter tree…"
            bind:value={filter}
            aria-label="Filter database tree"
        />
    </div>

    <nav class="tree" aria-label="Database outline">
        <!-- Networks (synthetic — DBC has BU_ / messages only) -->
        <div class="branch" aria-expanded={isOpen('networks')}>
            <button type="button" class="row head" onclick={() => toggle('networks')}>
                <span class="chev">{isOpen('networks') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-network" /></svg></span>
                <span class="label">Networks</span>
            </button>
            {#if isOpen('networks')}
                <div class="children" role="group">
                    <div class="branch nested" aria-expanded={isOpen('net')}>
                        <button type="button" class="row" onclick={() => toggle('net')}>
                            <span class="chev">{isOpen('net') ? '▼' : '▶'}</span>
                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-folder" /></svg></span>
                            <span class="label">{networkLabel}</span>
                        </button>
                        {#if isOpen('net')}
                            <div class="children" role="group">
                                <div class="branch nested" aria-expanded={isOpen('net_tx')}>
                                    <button type="button" class="row" onclick={() => toggle('net_tx')}>
                                        <span class="chev">{isOpen('net_tx') ? '▼' : '▶'}</span>
                                        <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-folder" /></svg></span>
                                        <span class="label">Tx Messages</span>
                                    </button>
                                    {#if isOpen('net_tx')}
                                        <div class="children" role="group">
                                            {#each filteredMessages as m (m.id)}
                                                <button
                                                    type="button"
                                                    class="row leaf"
                                                    class:active={selectedMessageId === m.id}
                                                    onclick={() => onSelectMessage(m.id)}
                                                >
                                                    <span class="chev placeholder"></span>
                                                    <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                                                    <span class="label truncate"
                                                        >{m.name} <span class="id">(0x{m.id.toString(16).toUpperCase()})</span></span
                                                    >
                                                </button>
                                            {:else}
                                                <div class="empty-leaf">No messages</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>

                                <div class="branch nested" aria-expanded={isOpen('net_sig')}>
                                    <button type="button" class="row" onclick={() => toggle('net_sig')}>
                                        <span class="chev">{isOpen('net_sig') ? '▼' : '▶'}</span>
                                        <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-folder" /></svg></span>
                                        <span class="label">Signals</span>
                                    </button>
                                    {#if isOpen('net_sig')}
                                        <div class="children" role="group">
                                            {#each filteredSignals as s (s.name)}
                                                <button type="button" class="row leaf" onclick={() => onSelectSignal(s.name)}>
                                                    <span class="chev placeholder"></span>
                                                    <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-signal" /></svg></span>
                                                    <span class="label truncate">{s.name}</span>
                                                </button>
                                            {:else}
                                                <div class="empty-leaf">No signals</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        <!-- ECUs (hierarchical ECU → node, like classic CAN tools) -->
        <div class="branch" aria-expanded={isOpen('ecus')}>
            <button type="button" class="row head" onclick={() => toggle('ecus')}>
                <span class="chev">{isOpen('ecus') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-node" /></svg></span>
                <span class="label">ECUs</span>
            </button>
            {#if isOpen('ecus')}
                <div class="children" role="group">
                    {#each filteredNodes as n (n.name)}
                        <div class="branch nested ecu-branch">
                            <button type="button" class="row" onclick={() => toggleEcuNode(n.name)}>
                                <span class="chev">{ecuOpen[n.name] ? '▼' : '▶'}</span>
                                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-node" /></svg></span>
                                <span class="label truncate">{n.name}</span>
                            </button>
                            {#if ecuOpen[n.name]}
                                <div class="children" role="group">
                                    <button type="button" class="row leaf" onclick={() => onSelectNode(n.name)}>
                                        <span class="chev placeholder"></span>
                                        <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-node" /></svg></span>
                                        <span class="label truncate">{n.name}</span>
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div class="empty-leaf">No nodes</div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Environment variables -->
        <div class="branch" aria-expanded={isOpen('env')}>
            <button type="button" class="row head" onclick={() => toggle('env')}>
                <span class="chev">{isOpen('env') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-env" /></svg></span>
                <span class="label">Environment variables</span>
            </button>
            {#if isOpen('env')}
                <div class="children" role="group">
                    {#each filteredEnv as ev (ev.name)}
                        <div class="row leaf static" title="Edit EV_ entries in the text view">
                            <span class="chev placeholder"></span>
                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-env" /></svg></span>
                            <span class="label truncate">{ev.name}</span>
                        </div>
                    {:else}
                        <div class="empty-leaf">No environment variables</div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Network nodes (per ECU: Tx / Rx messages) -->
        <div class="branch" aria-expanded={isOpen('netnodes')}>
            <button type="button" class="row head" onclick={() => toggle('netnodes')}>
                <span class="chev">{isOpen('netnodes') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-node" /></svg></span>
                <span class="label">Network nodes</span>
            </button>
            {#if isOpen('netnodes')}
                <div class="children" role="group">
                    {#each filteredNodesForNet as n (n.name)}
                        <div class="branch nested nn-node">
                            <button type="button" class="row" onclick={() => toggleNn(n.name, 'root')}>
                                <span class="chev">{isNnOpen(n.name, 'root') ? '▼' : '▶'}</span>
                                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-node" /></svg></span>
                                <span class="label truncate">{n.name}</span>
                            </button>
                            {#if isNnOpen(n.name, 'root')}
                                <div class="children nn-children" role="group">
                                    <div class="branch nested">
                                        <button type="button" class="row" onclick={() => toggleNn(n.name, 'tx')}>
                                            <span class="chev">{isNnOpen(n.name, 'tx') ? '▼' : '▶'}</span>
                                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                                            <span class="label">Tx Messages</span>
                                        </button>
                                        {#if isNnOpen(n.name, 'tx')}
                                            <div class="children" role="group">
                                                {#each txMessagesForNode(n.name) as m (m.id)}
                                                    <button
                                                        type="button"
                                                        class="row leaf"
                                                        class:active={selectedMessageId === m.id}
                                                        onclick={() => onSelectMessage(m.id)}
                                                    >
                                                        <span class="chev placeholder"></span>
                                                        <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                                                        <span class="label truncate"
                                                            >{m.name} <span class="id">(0x{m.id.toString(16).toUpperCase()})</span></span
                                                        >
                                                    </button>
                                                {:else}
                                                    <div class="empty-leaf">None</div>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="branch nested">
                                        <button type="button" class="row" onclick={() => toggleNn(n.name, 'rx')}>
                                            <span class="chev">{isNnOpen(n.name, 'rx') ? '▼' : '▶'}</span>
                                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                                            <span class="label">Rx Messages</span>
                                        </button>
                                        {#if isNnOpen(n.name, 'rx')}
                                            <div class="children" role="group">
                                                {#each rxMessagesForNode(n.name) as m (m.id)}
                                                    <button
                                                        type="button"
                                                        class="row leaf"
                                                        class:active={selectedMessageId === m.id}
                                                        onclick={() => onSelectMessage(m.id)}
                                                    >
                                                        <span class="chev placeholder"></span>
                                                        <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                                                        <span class="label truncate"
                                                            >{m.name} <span class="id">(0x{m.id.toString(16).toUpperCase()})</span></span
                                                        >
                                                    </button>
                                                {:else}
                                                    <div class="empty-leaf">None</div>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                    <button type="button" class="row leaf nn-goto" onclick={() => onSelectNode(n.name)}>
                                        <span class="chev placeholder"></span>
                                        <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-node" /></svg></span>
                                        <span class="label truncate">Node definition →</span>
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div class="empty-leaf">No nodes</div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Messages (global list, expandable → signals) -->
        <div class="branch" aria-expanded={isOpen('msgs')}>
            <button type="button" class="row head" onclick={() => toggle('msgs')}>
                <span class="chev">{isOpen('msgs') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                <span class="label">Messages</span>
            </button>
            {#if isOpen('msgs')}
                <div class="children" role="group">
                    {#each filteredMessages as m (m.id)}
                        <div class="branch nested msg-with-sigs">
                            <div class="row msg-split">
                                {#if m.signals.length > 0}
                                    <button
                                        type="button"
                                        class="chev-only"
                                        title="Show signals in frame"
                                        onclick={() => toggleMsgSignals(m.id)}
                                    >
                                        {msgSignalOpen[m.id] ? '▼' : '▶'}
                                    </button>
                                {:else}
                                    <span class="chev-spacer"></span>
                                {/if}
                                <button
                                    type="button"
                                    class="row leaf msg-select"
                                    class:active={selectedMessageId === m.id}
                                    onclick={() => onSelectMessage(m.id)}
                                >
                                    <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-message" /></svg></span>
                                    <span class="label truncate"
                                        >{m.name} <span class="id">(0x{m.id.toString(16).toUpperCase()})</span></span
                                    >
                                </button>
                            </div>
                            {#if msgSignalOpen[m.id] && m.signals.length > 0}
                                <div class="children msg-sig-children" role="group">
                                    {#each m.signals as sig (sig.name)}
                                        <button type="button" class="row leaf" onclick={() => onSelectSignal(sig.name)}>
                                            <span class="chev placeholder"></span>
                                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-signal" /></svg></span>
                                            <span class="label truncate">{sig.name}</span>
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {:else}
                        <div class="empty-leaf">No messages</div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Signals (global pool) -->
        <div class="branch" aria-expanded={isOpen('sigs')}>
            <button type="button" class="row head" onclick={() => toggle('sigs')}>
                <span class="chev">{isOpen('sigs') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-signal" /></svg></span>
                <span class="label">Signals</span>
            </button>
            {#if isOpen('sigs')}
                <div class="children" role="group">
                    {#each filteredSignals as s (s.name)}
                        <button type="button" class="row leaf" onclick={() => onSelectSignal(s.name)}>
                            <span class="chev placeholder"></span>
                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-signal" /></svg></span>
                            <span class="label truncate">{s.name}</span>
                        </button>
                    {:else}
                        <div class="empty-leaf">No signals in pool</div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Attribute definitions -->
        <div class="branch" aria-expanded={isOpen('attrs')}>
            <button type="button" class="row head" onclick={() => toggle('attrs')}>
                <span class="chev">{isOpen('attrs') ? '▼' : '▶'}</span>
                <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-attr" /></svg></span>
                <span class="label">Attribute definitions</span>
            </button>
            {#if isOpen('attrs')}
                <div class="children" role="group">
                    {#each filteredAttributeEntries as { a, index } (`${index}-${a.name}`)}
                        <button type="button" class="row leaf" onclick={() => onSelectAttribute(index)}>
                            <span class="chev placeholder"></span>
                            <span class="glyph"><svg viewBox="0 0 16 16" class="svg-use"><use href="#sym-attr" /></svg></span>
                            <span class="label truncate">{a.name}</span>
                        </button>
                    {:else}
                        <div class="empty-leaf">No attributes</div>
                    {/each}
                </div>
            {/if}
        </div>
    </nav>
</div>

<style>
    .sprite {
        position: absolute;
        width: 0;
        height: 0;
        overflow: hidden;
    }

    .explorer {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .search {
        padding: 0 10px 8px;
    }

    .search input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid var(--vscode-input-border, transparent);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-family: inherit;
        font-size: 12px;
    }

    .tree {
        flex: 1;
        overflow-y: auto;
        padding: 0 4px 12px 6px;
        font-size: 12px;
        user-select: none;
    }

    .branch {
        margin: 0;
    }

    .children {
        margin-left: 14px;
        border-left: 1px solid color-mix(in srgb, var(--vscode-tree-indentGuidesStroke) 55%, transparent);
        padding-left: 12px;
    }

    .nested .children {
        margin-left: 10px;
        padding-left: 10px;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 2px;
        width: 100%;
        text-align: left;
        padding: 3px 4px;
        margin: 1px 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--vscode-foreground);
        font: inherit;
        cursor: pointer;
    }

    .row.head {
        font-weight: 600;
    }

    .row:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .row.active {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .row.static {
        cursor: default;
        opacity: 0.95;
    }

    .row.static:hover {
        background: color-mix(in srgb, var(--vscode-list-hoverBackground) 40%, transparent);
    }

    .chev {
        display: inline-flex;
        width: 14px;
        flex-shrink: 0;
        justify-content: center;
        font-size: 9px;
        opacity: 0.75;
    }

    .chev.placeholder {
        visibility: hidden;
    }

    .glyph {
        display: flex;
        width: 18px;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
    }

    .svg-use {
        width: 16px;
        height: 16px;
    }

    .label {
        flex: 1;
        min-width: 0;
    }

    .label.truncate {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .label .id {
        font-family: var(--vscode-editor-font-family, monospace);
        font-weight: 500;
        opacity: 0.85;
    }

    .empty-leaf {
        padding: 4px 8px 6px 36px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
    }

    .msg-split {
        display: flex;
        align-items: stretch;
        width: 100%;
        margin: 1px 0;
        border-radius: 4px;
    }

    .msg-split:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .chev-only {
        width: 22px;
        flex-shrink: 0;
        align-self: stretch;
        border: none;
        background: transparent;
        cursor: pointer;
        color: inherit;
        font-size: 9px;
        opacity: 0.75;
        border-radius: 4px 0 0 4px;
    }

    .chev-only:hover {
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 80%, transparent);
    }

    .chev-spacer {
        width: 22px;
        flex-shrink: 0;
    }

    .msg-select.row.leaf {
        flex: 1;
        min-width: 0;
        margin: 0;
        border-radius: 0 4px 4px 0;
    }

    .msg-sig-children {
        margin-left: 8px;
    }

    .nn-children {
        padding-top: 2px;
    }

    .nn-goto {
        opacity: 0.95;
        font-size: 11px;
    }
</style>
