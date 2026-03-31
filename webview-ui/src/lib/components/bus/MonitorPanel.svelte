<script lang="ts">
    /**
     * Live CAN traffic monitor: frame log or static per-message signal view.
     */
    import type { MessageDescriptor } from '../../types';
    import { monitorStore, filteredFrames } from '../../stores/monitorStore';
    import { connectionStore, isConnected } from '../../stores/connectionStore';
    import { vscode } from '../../vscode';
    import SearchFilter from '../shared/SearchFilter.svelte';
    import FrameRow from './FrameRow.svelte';
    import MonitorStaticView from './MonitorStaticView.svelte';

    const VIEW_MODE_KEY = 'vscode-canbus.monitorViewMode';

    interface Props {
        messages: MessageDescriptor[];
    }

    let { messages }: Props = $props();

    type ViewMode = 'log' | 'live';

    function readViewMode(): ViewMode {
        try {
            const v = localStorage.getItem(VIEW_MODE_KEY);
            if (v === 'live' || v === 'log') return v;
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
        if (viewMode !== 'log' || !autoScroll || !tableContainer) return;
        requestAnimationFrame(() => {
            tableContainer!.scrollTop = tableContainer!.scrollHeight;
        });
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
        <button onclick={handleClear} title="Clear frame log and live values">🗑 Clear</button>

        <div class="view-toggle" role="group" aria-label="Monitor view mode">
            <button
                type="button"
                class:active={viewMode === 'log'}
                onclick={() => setViewMode('log')}
                title="Chronological list of received frames"
            >
                Frame log
            </button>
            <button
                type="button"
                class:active={viewMode === 'live'}
                onclick={() => setViewMode('live')}
                title="One block per message; values update as frames arrive"
            >
                Live signals
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
            placeholder={viewMode === 'log' ? 'Filter frames…' : 'Filter messages or signals…'}
            onFilter={(t) => monitorStore.setFilter(t)}
        />
        {#if viewMode === 'log'}
            <span class="frame-count">{$filteredFrames.length} frames</span>
        {:else}
            <span class="frame-count">{messages.length} messages</span>
        {/if}
    </div>

    {#if !$isConnected}
        <div class="status-message">
            <p class="status-lead">Not connected to a CAN adapter.</p>
            <p class="status-detail">
                Use the <strong>CAN connection</strong> status bar item or run <strong>CAN Bus: Connect to CAN Bus</strong> from the
                Command Palette. Signal Lab decodes traffic using the <strong>active database for decode</strong> in this panel’s
                header.
            </p>
            <p class="status-meta">State: {$connectionStore.state}</p>
        </div>
    {:else if viewMode === 'log'}
        <div class="table-header">
            <span class="col-time">Time</span>
            <span class="col-id">ID</span>
            <span class="col-name">Message</span>
            <span class="col-dlc">DLC</span>
            <span class="col-data">Data</span>
            <span class="col-signals">Decoded signals</span>
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
    {:else}
        <div class="static-wrap">
            <MonitorStaticView messages={messages} filterText={$monitorStore.filterText} />
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
    }

    .toolbar button:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .toolbar button:disabled {
        opacity: 0.5;
        cursor: default;
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

    .status-message {
        padding: 24px;
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

    /* Column template must match FrameRow `.monitor-table-grid` */
    .table-header {
        display: grid;
        grid-template-columns:
            11.5ch
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
