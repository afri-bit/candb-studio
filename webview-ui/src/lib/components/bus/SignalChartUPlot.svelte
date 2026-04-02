<script lang="ts">
  /**
   * Single-series uPlot for one `${frameId}:${signalName}` key; updates from parent render tick (~20 Hz).
   */
  import uPlot from 'uplot';
  import { signalChartStore } from '../../stores/signalChartStore';
  import { chartFillForStroke, chartStrokeColor, createSignalUPlotOpts } from './chartTheme';

  interface Props {
    seriesKey: string;
    colorIndex: number;
    renderTick: number;
    messageName: string;
    signalName: string;
    unit: string;
  }

  let { seriesKey, colorIndex, renderTick, messageName, signalName, unit }: Props = $props();

  let chartEl: HTMLDivElement | undefined = $state();
  const plotHeight = 168;

  let hasData = $derived.by(() => {
    renderTick;
    const [x] = signalChartStore.getSeriesData(seriesKey);
    return x.length > 0;
  });

  function alignedData(): uPlot.AlignedData {
    const [xs, ys] = signalChartStore.getSeriesData(seriesKey);
    if (xs.length === 0) {
      return [[], []];
    }
    if (xs.length === 1) {
      return [
        [xs[0], xs[0]],
        [ys[0], ys[0]],
      ];
    }
    return [xs, ys];
  }

  let plot: uPlot | null = null;

  $effect(() => {
    if (!hasData || !chartEl) {
      return;
    }
    const stroke = chartStrokeColor(colorIndex);
    const fill = chartFillForStroke(stroke);
    const w = Math.max(chartEl.clientWidth || 320, 200);
    const opts = createSignalUPlotOpts({ width: w, height: plotHeight, stroke, fill });
    const d = alignedData();
    plot = new uPlot(opts, d, chartEl);
    const ro = new ResizeObserver(() => {
      if (!plot || !chartEl) {
        return;
      }
      plot.setSize({ width: Math.max(chartEl.clientWidth, 200), height: plotHeight });
    });
    ro.observe(chartEl);
    requestAnimationFrame(() => {
      if (plot && chartEl) {
        plot.setSize({ width: Math.max(chartEl.clientWidth, 200), height: plotHeight });
      }
    });
    return () => {
      ro.disconnect();
      plot?.destroy();
      plot = null;
    };
  });

  $effect(() => {
    renderTick;
    if (!hasData || !plot) {
      return;
    }
    plot.setData(alignedData(), true);
  });
</script>

<div class="signal-chart-uplot">
  <div class="chart-title-row">
    <span class="chart-msg" title={messageName}>{messageName}</span>
    <span class="chart-signal">{signalName}</span>
    {#if unit}
      <span class="chart-unit">{unit}</span>
    {/if}
  </div>
  {#if hasData}
    <div class="chart-canvas-host" bind:this={chartEl}></div>
  {:else}
    <div class="chart-wait" role="status">Waiting for samples…</div>
  {/if}
</div>

<style>
  .signal-chart-uplot {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 8px;
  }

  .chart-title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
    font-size: 0.88em;
    line-height: 1.35;
  }

  .chart-msg {
    color: var(--vscode-descriptionForeground);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chart-signal {
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .chart-unit {
    color: var(--vscode-descriptionForeground);
    font-size: 0.95em;
  }

  .chart-canvas-host {
    width: 100%;
    min-height: 168px;
  }

  .chart-canvas-host :global(.uplot) {
    width: 100%;
  }

  .chart-wait {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    font-size: 0.88em;
    color: var(--vscode-descriptionForeground);
    background: color-mix(
      in srgb,
      var(--vscode-editorWidget-background) 88%,
      var(--vscode-editor-background)
    );
    border-radius: 6px;
    border: 1px dashed color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
  }
</style>
