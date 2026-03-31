<script lang="ts">
    /**
     * Live CAN traffic monitor panel.
     * Displays a scrolling table of decoded CAN frames received from the bus.
     */
    import { monitorStore, filteredFrames } from '../../stores/monitorStore';
    import { connectionStore, isConnected } from '../../stores/connectionStore';
    import { vscode } from '../../vscode';
    import SearchFilter from '../shared/SearchFilter.svelte';
    import FrameRow from './FrameRow.svelte';

    let autoScroll = $state(true);
    let tableContainer: HTMLDivElement | undefined = $state();

    function handleStartStop() {
        if ($monitorStore.isRunning) {
            vscode.postMessage({ type: 'monitor.stop' });
            monitorStore.setRunning(false);
        } else {
            vscode.postMessage({ type: 'monitor.start' });
            monitorStore.setRunning(true);
        }
    }

    function handleClear() {
        monitorStore.clear();
    }

    $effect(() => {
        void $filteredFrames;
        if (autoScroll && tableContainer) {
            requestAnimationFrame(() => {
                tableContainer!.scrollTop = tableContainer!.scrollHeight;
            });
        }
    });
</script>

<div class="monitor-panel">
    <div class="toolbar">
        <button
            onclick={handleStartStop}
            disabled={!$isConnected}
            title={$monitorStore.isRunning ? 'Stop monitoring' : 'Start monitoring'}
        >
            {$monitorStore.isRunning ? '⏹ Stop' : '▶ Start'}
        </button>
        <button onclick={handleClear} title="Clear all frames">🗑 Clear</button>
        <label class="auto-scroll">
            <input type="checkbox" bind:checked={autoScroll} />
            Auto-scroll
        </label>
        <span class="spacer"></span>
        <SearchFilter
            placeholder="Filter frames…"
            onFilter={(t) => monitorStore.setFilter(t)}
        />
        <span class="frame-count">{$filteredFrames.length} frames</span>
    </div>

    {#if !$isConnected}
        <div class="status-message">
            Connect to a CAN bus to begin monitoring.
            <br />
            <small>State: {$connectionStore.state}</small>
        </div>
    {:else}
        <div class="table-header">
            <span class="col-time">Time</span>
            <span class="col-id">ID</span>
            <span class="col-name">Message</span>
            <span class="col-dlc">DLC</span>
            <span class="col-data">Data</span>
            <span class="col-signals">Decoded Signals</span>
        </div>

        <div class="table-body" bind:this={tableContainer}>
            {#each $filteredFrames as decoded}
                <FrameRow {decoded} />
            {/each}

            {#if $filteredFrames.length === 0}
                <div class="empty">
                    {$monitorStore.isRunning ? 'Waiting for frames…' : 'Press Start to begin monitoring.'}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .monitor-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-bottom: 6px;
        flex-shrink: 0;
    }

    .toolbar button {
        padding: 3px 10px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
    }

    .toolbar button:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .toolbar button:disabled {
        opacity: 0.5;
        cursor: default;
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

    .status-message {
        padding: 24px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
    }

    .table-header {
        display: flex;
        gap: 4px;
        padding: 3px 4px;
        background: var(--vscode-editorGroupHeader-tabsBackground);
        border-bottom: 1px solid var(--vscode-widget-border, #444);
        font-weight: 600;
        font-size: 0.85em;
        flex-shrink: 0;
    }

    .table-body {
        flex: 1;
        overflow-y: auto;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.85em;
    }

    .col-time { width: 90px; flex-shrink: 0; }
    .col-id { width: 70px; flex-shrink: 0; }
    .col-name { width: 130px; flex-shrink: 0; }
    .col-dlc { width: 35px; flex-shrink: 0; }
    .col-data { width: 200px; flex-shrink: 0; }
    .col-signals { flex: 1; }

    .empty {
        padding: 24px;
        text-align: center;
        color: var(--vscode-descriptionForeground);
    }
</style>
