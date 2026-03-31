<script lang="ts">
    /**
     * CAN message transmit panel.
     * Supports single-shot and periodic transmission using database definitions.
     */
    import type { MessageDescriptor } from '../../types';
    import { isConnected } from '../../stores/connectionStore';
    import { transmitPeriodicStore } from '../../stores/transmitPeriodicStore';
    import { vscode } from '../../vscode';
    import SearchFilter from '../shared/SearchFilter.svelte';

    interface Props {
        messages: MessageDescriptor[];
    }

    let { messages }: Props = $props();

    let filterText = $state('');
    let selectedMessageIndex: number | null = $state(null);
    let dataHex = $state('00 00 00 00 00 00 00 00');
    /** User-facing repeat rate: value + unit → ms for the extension. */
    let intervalUnit = $state<'s' | 'ms'>('s');
    let intervalValue = $state(0.1);

    /** Stable list for {#each} — from module-level store so tab switches do not lose state. */
    let periodicMessageIds = $derived(
        Object.keys($transmitPeriodicStore.intervals)
            .map(Number)
            .sort((a, b) => a - b),
    );

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

    function getIntervalMs(): number {
        if (intervalUnit === 's') {
            return Math.max(1, Math.round(intervalValue * 1000));
        }
        return Math.max(1, Math.round(intervalValue));
    }

    function formatIntervalLabel(ms: number): string {
        if (ms >= 1000 && ms % 1000 === 0) {
            return `every ${ms / 1000}s`;
        }
        if (ms >= 1000) {
            return `every ${(ms / 1000).toFixed(2)}s`;
        }
        return `every ${ms}ms`;
    }

    function messageNameForId(id: number): string {
        return messages.find((m) => m.id === id)?.name ?? `0x${id.toString(16).toUpperCase()}`;
    }

    function handleSendOnce() {
        if (!selectedMessage) return;
        const data = parseDataHex(dataHex);
        vscode.postMessage({ type: 'transmit.send', messageId: selectedMessage.id, data });
    }

    function stopPeriodicForId(id: number) {
        vscode.postMessage({ type: 'transmit.stopPeriodic', messageId: id });
        transmitPeriodicStore.stop(id);
    }

    function handleTogglePeriodic() {
        if (!selectedMessage) return;
        const id = selectedMessage.id;
        const intervals = $transmitPeriodicStore.intervals;

        if (intervals[id] !== undefined) {
            stopPeriodicForId(id);
        } else {
            const data = parseDataHex(dataHex);
            const ms = getIntervalMs();
            vscode.postMessage({
                type: 'transmit.startPeriodic',
                messageId: id,
                data,
                intervalMs: ms,
            });
            transmitPeriodicStore.start(id, ms);
        }
    }

    function stopAllPeriodic() {
        for (const id of periodicMessageIds) {
            vscode.postMessage({ type: 'transmit.stopPeriodic', messageId: id });
        }
        transmitPeriodicStore.stopAll();
    }
</script>

<div class="transmit-panel">
    <div class="toolbar">
        <SearchFilter placeholder="Filter messages…" onFilter={(t) => (filterText = t)} />
    </div>

    {#if periodicMessageIds.length > 0}
        <div class="periodic-banner" role="status">
            <div class="periodic-banner-head">
                <span class="periodic-banner-title">Transmitting periodically</span>
                <button type="button" class="btn-stop-all" onclick={stopAllPeriodic}>Stop all</button>
            </div>
            <ul class="periodic-list">
                {#each periodicMessageIds as id (id)}
                    <li class="periodic-item">
                        <span class="periodic-item-name">{messageNameForId(id)}</span>
                        <span class="periodic-item-rate"
                            >{formatIntervalLabel($transmitPeriodicStore.intervals[id] ?? 0)}</span
                        >
                        <button type="button" class="btn-stop-one" onclick={() => stopPeriodicForId(id)}>Stop</button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

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
                    {#if $transmitPeriodicStore.intervals[msg.id] !== undefined}
                        <span class="periodic-badge" title="Periodic transmit active"
                            >{formatIntervalLabel($transmitPeriodicStore.intervals[msg.id] ?? 0)}</span
                        >
                    {/if}
                </button>
            {/each}

            {#if filteredMessages.length === 0}
                <div class="empty">
                    {#if messages.length === 0}
                        No frames are defined in the active database. Load a different DBC as the active database for decode, or add
                        messages in the CAN Database Editor.
                    {:else}
                        No messages match the filter.
                    {/if}
                </div>
            {/if}
        </div>

        {#if selectedMessage}
            <div class="transmit-form">
                <h3>{selectedMessage.name} (0x{selectedMessage.id.toString(16).toUpperCase()})</h3>

                <label class="field">
                    <span>Data (hex bytes)</span>
                    <input type="text" bind:value={dataHex} placeholder="00 00 00 00 00 00 00 00" />
                </label>

                <div class="field interval-field">
                    <span>Repeat every</span>
                    <div class="interval-row">
                        <input
                            type="number"
                            bind:value={intervalValue}
                            min={intervalUnit === 's' ? 0.001 : 1}
                            step={intervalUnit === 's' ? 0.001 : 1}
                            title={intervalUnit === 's' ? 'Interval in seconds' : 'Interval in milliseconds'}
                        />
                        <select bind:value={intervalUnit} class="interval-unit" title="Time unit">
                            <option value="s">seconds</option>
                            <option value="ms">milliseconds</option>
                        </select>
                    </div>
                    <span class="field-hint">Sends about once every {getIntervalMs()} ms ({(getIntervalMs() / 1000).toFixed(3)} s)</span>
                </div>

                <div class="actions">
                    <button
                        onclick={handleSendOnce}
                        disabled={!$isConnected}
                        title="Send message once"
                    >
                        Send once
                    </button>
                    <button
                        onclick={handleTogglePeriodic}
                        disabled={!$isConnected}
                        class:btn-periodic-on={$transmitPeriodicStore.intervals[selectedMessage.id] !== undefined}
                    >
                        {$transmitPeriodicStore.intervals[selectedMessage.id] !== undefined
                            ? 'Stop periodic for this message'
                            : 'Start periodic'}
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

    .periodic-banner {
        flex-shrink: 0;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid color-mix(in srgb, var(--vscode-charts-green) 45%, var(--vscode-widget-border));
        background: color-mix(in srgb, var(--vscode-charts-green) 12%, var(--vscode-editor-background));
    }

    .periodic-banner-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
    }

    .periodic-banner-title {
        font-weight: 600;
        font-size: 0.92em;
    }

    .btn-stop-all {
        padding: 3px 10px;
        font-size: 0.85em;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        border-radius: 4px;
        font-family: inherit;
    }

    .btn-stop-all:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .periodic-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .periodic-item {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.88em;
    }

    .periodic-item-name {
        font-weight: 600;
        min-width: 0;
    }

    .periodic-item-rate {
        color: var(--vscode-descriptionForeground);
        flex: 1;
        min-width: 0;
    }

    .btn-stop-one {
        padding: 2px 8px;
        font-size: 0.85em;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
        border-radius: 4px;
        font-family: inherit;
    }

    .btn-stop-one:hover {
        background: var(--vscode-button-hoverBackground);
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
        font-size: 0.65em;
        padding: 2px 5px;
        border-radius: 3px;
        background: var(--vscode-charts-green);
        color: #fff;
        white-space: nowrap;
        max-width: 7rem;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .interval-field .interval-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .interval-field input[type='number'] {
        width: 7rem;
        min-width: 0;
    }

    .interval-unit {
        padding: 3px 6px;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        font-family: inherit;
        font-size: inherit;
        border-radius: 2px;
    }

    .field-hint {
        font-size: 0.8em;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
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

    .actions button.btn-periodic-on {
        background: color-mix(in srgb, var(--vscode-charts-green) 35%, var(--vscode-button-background));
        border-color: var(--vscode-charts-green);
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
