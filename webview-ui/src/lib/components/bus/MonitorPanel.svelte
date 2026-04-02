<script lang="ts">
    /**
     * Live CAN traffic monitor (frame log / live signals). Start/Stop is on the Signal Lab ribbon.
     */
    import type { MessageDescriptor } from '../../types';
    import { monitorStore, filteredRxFrames, filteredTxFrames } from '../../stores/monitorStore';
    import { connectionStore, isConnected } from '../../stores/connectionStore';
    import SearchFilter from '../shared/SearchFilter.svelte';
    import FrameRow from './FrameRow.svelte';
    import MonitorStaticView from './MonitorStaticView.svelte';
    import MonitorRawTable from './MonitorRawTable.svelte';

    const VIEW_MODE_KEY = 'candb-studio.monitorViewMode';

    interface Props {
        messages: MessageDescriptor[];
    }

    let { messages }: Props = $props();

    type ViewMode = 'log' | 'live' | 'raw';

    function readViewMode(): ViewMode {
        try {
            const v = localStorage.getItem(VIEW_MODE_KEY);
            if (v === 'live' || v === 'log' || v === 'raw') return v;
        } catch {
            /* ignore */
        }
        return 'log';
    }

    function persistViewMode(m: ViewMode) {
        try {
            localStorage.setItem(VIEW_MODE_KEY, m);
        } catch {
            /* ignore */
        }
    }

    let viewMode: ViewMode = $state(readViewMode());

    function setViewMode(m: ViewMode) {
        viewMode = m;
        persistViewMode(m);
    }

    let uniqueRxCount = $derived(Object.keys($monitorStore.liveRxByMessageId).length);
    let uniqueTxCount = $derived(Object.keys($monitorStore.liveTxByMessageId).length);
    let totalFrameCount = $derived($filteredRxFrames.length + $filteredTxFrames.length);

    let autoScroll = $state(true);
    let tableContainer: HTMLDivElement | undefined = $state();

    function handleClear() {
        monitorStore.clear();
    }

    $effect(() => {
        void $filteredRxFrames;
        void $filteredTxFrames;
        if (viewMode !== 'log' || !autoScroll || !tableContainer) return;
        requestAnimationFrame(() => {
            tableContainer!.scrollTop = tableContainer!.scrollHeight;
        });
    });
</script>

<div class="monitor-panel">
    {#if messages.length === 0}
        <div class="toolbar">
            <button type="button" onclick={handleClear} title="Clear frame log and per-ID snapshots"
                >Clear</button
            >
            <span class="spacer"></span>
            <SearchFilter
                placeholder="Filter by CAN ID (hex or decimal)…"
                onFilter={(t) => monitorStore.setFilter(t)}
            />
            <span class="frame-count">Rx {uniqueRxCount} · Tx {uniqueTxCount}</span>
        </div>

        {#if !$isConnected}
            <div class="status-message">
                <p class="status-lead">Not connected to a CAN adapter.</p>
                <p class="status-detail">
                    Use the status bar or <strong>CANdb Studio: Connect to CAN Bus</strong>.
                </p>
                <p class="status-meta">State: {$connectionStore.state}</p>
            </div>
        {:else}
            <div class="static-wrap split-raw">
                <h3 class="log-section-title">Received (Rx)</h3>
                <MonitorRawTable
                    which="rx"
                    filterText={$monitorStore.filterText}
                    noDatabaseHint={true}
                />
                <h3 class="log-section-title">Transmitted (Tx)</h3>
                <MonitorRawTable
                    which="tx"
                    filterText={$monitorStore.filterText}
                    noDatabaseHint={true}
                />
            </div>
        {/if}
    {:else}
        <div class="toolbar">
            <button type="button" onclick={handleClear} title="Clear frame log and live values"
                >Clear</button
            >

            <div class="view-toggle" role="group" aria-label="Monitor view mode">
                <button
                    type="button"
                    class:active={viewMode === 'log'}
                    onclick={() => setViewMode('log')}
                    title="Chronological log split into received (Rx) and transmit echo (Tx)"
                >
                    Frame log
                </button>
                <button
                    type="button"
                    class:active={viewMode === 'live'}
                    onclick={() => setViewMode('live')}
                    title="One block per DBC message; signal values update as frames arrive"
                >
                    Live signals
                </button>
                <button
                    type="button"
                    class:active={viewMode === 'raw'}
                    onclick={() => setViewMode('raw')}
                    title="One row per CAN ID; payload overwrites when a new frame arrives"
                >
                    Raw IDs
                </button>
            </div>

            {#if viewMode === 'log'}
                <label class="auto-scroll">
                    <input type="checkbox" bind:checked={autoScroll} />
                    Auto-scroll
                </label>
            {/if}

            <span class="spacer"></span>
            <SearchFilter
                placeholder={viewMode === 'log'
                    ? 'Filter frames…'
                    : viewMode === 'raw'
                      ? 'Filter by CAN ID…'
                      : 'Filter messages or signals…'}
                onFilter={(t) => monitorStore.setFilter(t)}
            />
            {#if viewMode === 'log'}
                <span class="frame-count">{totalFrameCount} frames</span>
            {:else if viewMode === 'raw'}
                <span class="frame-count">Rx {uniqueRxCount} · Tx {uniqueTxCount}</span>
            {:else}
                <span class="frame-count">{messages.length} messages</span>
            {/if}
        </div>

        {#if !$isConnected}
            <div class="status-message">
                <p class="status-lead">Not connected to a CAN adapter.</p>
                <p class="status-detail">
                    Use the status bar or <strong>CANdb Studio: Connect to CAN Bus</strong>.
                </p>
                <p class="status-meta">State: {$connectionStore.state}</p>
            </div>
        {:else if viewMode === 'log'}
            <div class="table-body" bind:this={tableContainer}>
                <div class="log-section">
                    <h4 class="log-section-heading">Received (Rx)</h4>
                    <div class="table-header">
                        <span class="col-time">Time</span>
                        <span class="col-dir">Dir</span>
                        <span class="col-id">ID</span>
                        <span class="col-name">Message</span>
                        <span class="col-dlc">DLC</span>
                        <span class="col-data">Data</span>
                        <span class="col-signals">Decoded signals</span>
                    </div>
                    {#each $filteredRxFrames as decoded, i (i)}
                        <FrameRow {decoded} />
                    {/each}
                </div>
                <div class="log-section">
                    <h4 class="log-section-heading">Transmitted (Tx)</h4>
                    <div class="table-header">
                        <span class="col-time">Time</span>
                        <span class="col-dir">Dir</span>
                        <span class="col-id">ID</span>
                        <span class="col-name">Message</span>
                        <span class="col-dlc">DLC</span>
                        <span class="col-data">Data</span>
                        <span class="col-signals">Decoded signals</span>
                    </div>
                    {#each $filteredTxFrames as decoded, i (i)}
                        <FrameRow {decoded} />
                    {/each}
                </div>
                {#if $filteredRxFrames.length === 0 && $filteredTxFrames.length === 0}
                    <div class="empty">
                        {$monitorStore.isRunning
                            ? 'Waiting for frames…'
                            : 'Start monitoring from the ribbon.'}
                    </div>
                {/if}
            </div>
        {:else if viewMode === 'raw'}
            <div class="static-wrap split-raw">
                <h3 class="log-section-title">Received (Rx)</h3>
                <MonitorRawTable
                    which="rx"
                    filterText={$monitorStore.filterText}
                    noDatabaseHint={false}
                />
                <h3 class="log-section-title">Transmitted (Tx)</h3>
                <MonitorRawTable
                    which="tx"
                    filterText={$monitorStore.filterText}
                    noDatabaseHint={false}
                />
            </div>
        {:else}
            <div class="static-wrap">
                <MonitorStaticView {messages} filterText={$monitorStore.filterText} />
            </div>
        {/if}
    {/if}
</div>

<style>
    .monitor-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-bottom: 6px;
        flex-shrink: 0;
        flex-wrap: wrap;
    }

    .toolbar button {
        padding: 3px 10px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
        border-radius: 3px;
    }

    .toolbar button:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .view-toggle {
        display: inline-flex;
        border: 1px solid color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
        border-radius: 6px;
        overflow: hidden;
    }

    .view-toggle button {
        border: none;
        border-radius: 0;
        background: transparent;
        color: var(--vscode-foreground);
        padding: 4px 10px;
        font-size: 0.88em;
    }

    .view-toggle button:hover {
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 80%, transparent);
    }

    .view-toggle button.active {
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 100%, transparent);
        font-weight: 600;
    }

    .auto-scroll {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.9em;
        color: var(--vscode-descriptionForeground);
    }

    .spacer {
        flex: 1;
    }

    .frame-count {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        white-space: nowrap;
    }

    .static-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .split-raw {
        gap: 12px;
        overflow: auto;
    }

    .log-section-title {
        margin: 0;
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--vscode-descriptionForeground);
        flex-shrink: 0;
    }

    .log-section {
        margin-bottom: 12px;
    }

    .log-section:last-child {
        margin-bottom: 0;
    }

    .log-section-heading {
        margin: 0 0 6px 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .status-message {
        padding: 20px 16px;
        max-width: 520px;
        margin: 0 auto;
        text-align: left;
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
    }

    .status-lead {
        margin: 0 0 8px 0;
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .status-detail {
        margin: 0 0 12px 0;
        font-size: 0.95em;
    }

    .status-meta {
        margin: 0;
        font-size: 0.85em;
        opacity: 0.9;
    }

    .table-header {
        display: grid;
        grid-template-columns:
            11.5ch
            2.25rem
            minmax(4.5rem, 5.5rem)
            minmax(5rem, 9rem)
            2.25rem
            minmax(9rem, 14rem)
            minmax(0, 1fr);
        column-gap: 10px;
        align-items: center;
        padding: 6px 8px;
        background: var(--vscode-editorGroupHeader-tabsBackground);
        border-bottom: 1px solid var(--vscode-widget-border, #444);
        font-weight: 600;
        font-size: 0.85em;
        flex-shrink: 0;
    }

    .table-header .col-dlc {
        text-align: end;
    }

    .table-header .col-dir {
        text-align: center;
        font-size: 0.78em;
    }

    .table-body {
        flex: 1;
        overflow: auto;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.85em;
    }

    .empty {
        padding: 24px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
    }
</style>
