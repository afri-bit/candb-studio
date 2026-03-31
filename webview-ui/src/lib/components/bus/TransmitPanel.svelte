<script lang="ts">
    /**
     * CAN message transmit panel.
     * Supports single-shot and periodic transmission using database definitions.
     */
    import type { MessageDescriptor } from '../../types';
    import { isConnected } from '../../stores/connectionStore';
    import { vscode } from '../../vscode';
    import SearchFilter from '../shared/SearchFilter.svelte';

    interface Props {
        messages: MessageDescriptor[];
    }

    let { messages }: Props = $props();

    let filterText = $state('');
    let selectedMessageIndex: number | null = $state(null);
    let dataHex = $state('00 00 00 00 00 00 00 00');
    let periodicInterval = $state(100);
    let activePeriodicIds = $state(new Set<number>());

    let filteredMessages = $derived.by(() => {
        if (!filterText) return messages;
        const lower = filterText.toLowerCase();
        return messages.filter(
            (m) =>
                m.name.toLowerCase().includes(lower) ||
                m.id.toString(16).includes(lower),
        );
    });

    let selectedMessage = $derived(
        selectedMessageIndex !== null ? filteredMessages[selectedMessageIndex] ?? null : null,
    );

    function parseDataHex(hex: string): number[] {
        return hex
            .trim()
            .split(/\s+/)
            .map((b) => parseInt(b, 16))
            .filter((n) => !isNaN(n));
    }

    function handleSendOnce() {
        if (!selectedMessage) return;
        const data = parseDataHex(dataHex);
        vscode.postMessage({ type: 'transmit.send', messageId: selectedMessage.id, data });
    }

    function handleTogglePeriodic() {
        if (!selectedMessage) return;
        const id = selectedMessage.id;

        if (activePeriodicIds.has(id)) {
            vscode.postMessage({ type: 'transmit.stopPeriodic', messageId: id });
            activePeriodicIds = new Set([...activePeriodicIds].filter((x) => x !== id));
        } else {
            const data = parseDataHex(dataHex);
            vscode.postMessage({
                type: 'transmit.startPeriodic',
                messageId: id,
                data,
                intervalMs: periodicInterval,
            });
            activePeriodicIds = new Set([...activePeriodicIds, id]);
        }
    }
</script>

<div class="transmit-panel">
    <div class="toolbar">
        <SearchFilter placeholder="Filter messages…" onFilter={(t) => (filterText = t)} />
    </div>

    <div class="content">
        <div class="message-list">
            {#each filteredMessages as msg, i}
                <button
                    class="message-item"
                    class:selected={selectedMessageIndex === i}
                    onclick={() => { selectedMessageIndex = i; dataHex = '00'.repeat(msg.dlc).replace(/(.{2})/g, '$1 ').trim(); }}
                >
                    <span class="msg-id">0x{msg.id.toString(16).toUpperCase().padStart(3, '0')}</span>
                    <span class="msg-name">{msg.name}</span>
                    {#if activePeriodicIds.has(msg.id)}
                        <span class="periodic-badge">periodic</span>
                    {/if}
                </button>
            {/each}

            {#if filteredMessages.length === 0}
                <div class="empty">No messages available</div>
            {/if}
        </div>

        {#if selectedMessage}
            <div class="transmit-form">
                <h3>{selectedMessage.name} (0x{selectedMessage.id.toString(16).toUpperCase()})</h3>

                <label class="field">
                    <span>Data (hex bytes)</span>
                    <input type="text" bind:value={dataHex} placeholder="00 00 00 00 00 00 00 00" />
                </label>

                <label class="field">
                    <span>Periodic interval (ms)</span>
                    <input type="number" bind:value={periodicInterval} min="1" max="10000" />
                </label>

                <div class="actions">
                    <button
                        onclick={handleSendOnce}
                        disabled={!$isConnected}
                        title="Send message once"
                    >
                        Send Once
                    </button>
                    <button
                        onclick={handleTogglePeriodic}
                        disabled={!$isConnected}
                        class:active={activePeriodicIds.has(selectedMessage.id)}
                    >
                        {activePeriodicIds.has(selectedMessage.id) ? 'Stop Periodic' : 'Start Periodic'}
                    </button>
                </div>

                {#if selectedMessage.signals.length > 0}
                    <div class="signal-summary">
                        <h4>Signals</h4>
                        {#each selectedMessage.signals as sig}
                            <div class="signal-row">
                                <span class="sig-name">{sig.name}</span>
                                <span class="sig-info">[{sig.startBit}:{sig.bitLength}] {sig.unit}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {:else}
            <div class="placeholder">Select a message to configure transmission.</div>
        {/if}
    </div>
</div>

<style>
    .transmit-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 8px;
    }

    .toolbar {
        flex-shrink: 0;
    }

    .content {
        display: flex;
        gap: 12px;
        flex: 1;
        min-height: 0;
    }

    .message-list {
        width: 240px;
        flex-shrink: 0;
        overflow-y: auto;
        border: 1px solid var(--vscode-widget-border, #444);
        border-radius: 2px;
    }

    .message-item {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 4px 8px;
        border: none;
        background: transparent;
        color: var(--vscode-foreground);
        font-family: inherit;
        font-size: inherit;
        cursor: pointer;
        text-align: left;
    }

    .message-item:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .message-item.selected {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .msg-id {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.9em;
        opacity: 0.7;
    }

    .msg-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .periodic-badge {
        font-size: 0.7em;
        padding: 1px 4px;
        border-radius: 3px;
        background: var(--vscode-charts-green);
        color: #fff;
    }

    .transmit-form {
        flex: 1;
        overflow-y: auto;
    }

    .transmit-form h3 {
        margin: 0 0 8px 0;
        font-size: 1em;
        font-weight: 600;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-bottom: 8px;
    }

    .field span {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
    }

    .field input {
        padding: 3px 6px;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: inherit;
    }

    .field input:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }

    .actions {
        display: flex;
        gap: 6px;
        margin-bottom: 12px;
    }

    .actions button {
        padding: 4px 12px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
    }

    .actions button:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .actions button:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .actions button.active {
        background: var(--vscode-inputValidation-warningBackground, #5a4e00);
    }

    .signal-summary h4 {
        margin: 0 0 4px 0;
        font-size: 0.95em;
        font-weight: 600;
    }

    .signal-row {
        display: flex;
        gap: 8px;
        padding: 2px 0;
        font-size: 0.9em;
    }

    .sig-name {
        font-weight: 500;
    }

    .sig-info {
        color: var(--vscode-descriptionForeground);
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.9em;
    }

    .placeholder, .empty {
        padding: 24px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
    }
</style>
