<script lang="ts">
    /**
     * Signal selection and stacked uPlot charts (ring-buffer data from signalChartStore).
     */
    import { onMount } from 'svelte';
    import type { MessageDescriptor } from '../../types';
    import { isConnected } from '../../stores/connectionStore';
    import { monitorStore } from '../../stores/monitorStore';
    import {
        seriesKey,
        signalChartStore,
        signalChartRevision,
        signalChartSelectedKeys,
    } from '../../stores/signalChartStore';
    import SearchFilter from '../shared/SearchFilter.svelte';
    import SignalChartUPlot from './SignalChartUPlot.svelte';

    interface Props {
        messages: MessageDescriptor[];
    }

    let { messages }: Props = $props();

    let filterText = $state('');
    /** Throttled redraw tick (~20 Hz). */
    let renderTick = $state(0);
    let revisionDirty = $state(false);

    const THROTTLE_MS = 50;

    type SignalOption = {
        key: string;
        messageName: string;
        messageId: number;
        signalName: string;
        unit: string;
    };

    let allOptions = $derived.by((): SignalOption[] => {
        const out: SignalOption[] = [];
        for (const m of messages) {
            for (const s of m.signals) {
                out.push({
                    key: seriesKey(m.id, s.name),
                    messageName: m.name,
                    messageId: m.id,
                    signalName: s.name,
                    unit: s.unit?.trim() ?? '',
                });
            }
        }
        out.sort((a, b) =>
            a.messageName !== b.messageName
                ? a.messageName.localeCompare(b.messageName)
                : a.signalName.localeCompare(b.signalName),
        );
        return out;
    });

    let filteredOptions = $derived.by(() => {
        if (!filterText.trim()) {
            return allOptions;
        }
        const q = filterText.toLowerCase();
        return allOptions.filter(
            (o) =>
                o.messageName.toLowerCase().includes(q) ||
                o.signalName.toLowerCase().includes(q) ||
                o.messageId.toString(16).includes(q) ||
                `0x${o.messageId.toString(16)}`.includes(q),
        );
    });

    let selectedArr = $derived(Array.from($signalChartSelectedKeys));

    let chartRows = $derived.by(() => {
        const sel = $signalChartSelectedKeys;
        const rows: { key: string; option: SignalOption; colorIndex: number }[] = [];
        let i = 0;
        for (const o of allOptions) {
            if (!sel.has(o.key)) {
                continue;
            }
            rows.push({ key: o.key, option: o, colorIndex: i });
            i++;
        }
        return rows;
    });

    function toggleKey(key: string) {
        const next = new Set($signalChartSelectedKeys);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        signalChartStore.setSelectedKeys(next);
    }

    onMount(() => {
        const unsub = signalChartRevision.subscribe(() => {
            revisionDirty = true;
        });
        const id = window.setInterval(() => {
            if (revisionDirty) {
                revisionDirty = false;
                renderTick++;
            }
        }, THROTTLE_MS);
        return () => {
            unsub();
            window.clearInterval(id);
        };
    });

</script>

<div class="signal-chart-panel">
    <div class="chart-toolbar">
        <SearchFilter placeholder="Filter signals…" onFilter={(t) => (filterText = t)} />
    </div>

    {#if !$isConnected}
        <div class="chart-hero" role="status">
            <p class="hero-title">Connect hardware</p>
            <p class="hero-body">
                Connect a CAN adapter from the status bar or Command Palette, then start the monitor on the Monitor tab. Charts
                plot decoded physical values from live traffic.
            </p>
        </div>
    {:else if !$monitorStore.isRunning}
        <div class="chart-hero" role="status">
            <p class="hero-title">Start monitoring</p>
            <p class="hero-body">
                Open the <strong>Monitor</strong> tab and press <strong>Start</strong> so frames are decoded. Return here to pick
                signals and view traces.
            </p>
        </div>
    {:else}
        <div class="chart-layout">
            <aside class="signal-picker" aria-label="Signal selection">
                <div class="picker-header">Signals</div>
                <div class="picker-list">
                    {#if filteredOptions.length === 0}
                        <p class="picker-empty">No signals match the filter.</p>
                    {:else}
                        {#each filteredOptions as o (o.key)}
                            <label class="picker-row">
                                <input
                                    type="checkbox"
                                    checked={$signalChartSelectedKeys.has(o.key)}
                                    onchange={() => toggleKey(o.key)}
                                />
                                <span class="picker-label" title="{o.messageName} · {o.signalName}">
                                    <span class="picker-msg">{o.messageName}</span>
                                    <span class="picker-sig">{o.signalName}</span>
                                    {#if o.unit}
                                        <span class="picker-unit">{o.unit}</span>
                                    {/if}
                                </span>
                            </label>
                        {/each}
                    {/if}
                </div>
            </aside>

            <section class="chart-stack" aria-label="Signal charts">
                {#if selectedArr.length === 0}
                    <div class="chart-hero chart-hero-inline" role="status">
                        <p class="hero-title">Select signals</p>
                        <p class="hero-body">
                            Choose one or more signals on the left. Each selection gets its own chart with a shared time axis
                            (timestamps from decoded frames).
                        </p>
                    </div>
                {:else}
                    {#each chartRows as row (row.key)}
                        <article class="chart-card">
                            <SignalChartUPlot
                                seriesKey={row.key}
                                colorIndex={row.colorIndex}
                                {renderTick}
                                messageName={row.option.messageName}
                                signalName={row.option.signalName}
                                unit={row.option.unit}
                            />
                        </article>
                    {/each}
                {/if}
            </section>
        </div>
    {/if}
</div>

<style>
    .signal-chart-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: hidden;
    }

    .chart-toolbar {
        flex-shrink: 0;
    }

    .chart-layout {
        flex: 1;
        min-height: 0;
        display: flex;
        gap: 12px;
        overflow: hidden;
    }

    .signal-picker {
        flex: 0 0 min(320px, 38%);
        min-width: 200px;
        display: flex;
        flex-direction: column;
        min-height: 0;
        border: 1px solid var(--vscode-widget-border, color-mix(in srgb, var(--vscode-foreground) 14%, transparent));
        border-radius: 8px;
        background: color-mix(in srgb, var(--vscode-editorWidget-background) 55%, var(--vscode-editor-background));
        overflow: hidden;
    }

    .picker-header {
        padding: 8px 10px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground);
        border-bottom: 1px solid var(--vscode-widget-border, color-mix(in srgb, var(--vscode-foreground) 12%, transparent));
    }

    .picker-list {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 6px 4px 8px;
    }

    .picker-empty {
        margin: 8px 10px;
        font-size: 0.88em;
        color: var(--vscode-descriptionForeground);
    }

    .picker-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.86em;
        line-height: 1.35;
    }

    .picker-row:hover {
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
    }

    .picker-row input {
        margin-top: 2px;
    }

    .picker-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .picker-msg {
        color: var(--vscode-descriptionForeground);
        font-size: 0.95em;
    }

    .picker-sig {
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .picker-unit {
        font-size: 0.9em;
        color: var(--vscode-descriptionForeground);
    }

    .chart-stack {
        flex: 1;
        min-width: 0;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-right: 2px;
    }

    .chart-card {
        flex-shrink: 0;
        padding: 12px 14px 14px;
        border-radius: 8px;
        border: 1px solid var(--vscode-widget-border, color-mix(in srgb, var(--vscode-foreground) 14%, transparent));
        background: color-mix(in srgb, var(--vscode-editorWidget-background) 35%, var(--vscode-editor-background));
    }

    .chart-hero {
        flex: 1;
        min-height: 180px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 24px 20px;
        gap: 8px;
        border-radius: 8px;
        border: 1px dashed color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
        background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-sideBar-background));
    }

    .chart-hero-inline {
        min-height: 160px;
    }

    .hero-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--vscode-foreground);
    }

    .hero-body {
        margin: 0;
        max-width: 480px;
        font-size: 0.9em;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground);
    }
</style>
