import uPlot from 'uplot';

const CHART_COLOR_VARS = [
  '--vscode-charts-blue',
  '--vscode-charts-green',
  '--vscode-charts-yellow',
  '--vscode-charts-orange',
  '--vscode-charts-purple',
  '--vscode-charts-red',
] as const;

function readCssVar(name: string): string {
  if (typeof document === 'undefined') {
    return '#888888';
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || '#888888';
}

/** Canvas-safe rgba from any CSS color (e.g. var-resolved stroke). */
export function withAlpha(color: string, alpha: number): string {
  if (typeof document === 'undefined') {
    return color;
  }
  const el = document.createElement('div');
  el.style.color = color;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = rgb.match(/\d+/g);
  if (m && m.length >= 3) {
    return `rgba(${m[0]},${m[1]},${m[2]},${alpha})`;
  }
  return color;
}

/** Resolved stroke color for a chart index (0-based). */
export function chartStrokeColor(index: number): string {
  const name = CHART_COLOR_VARS[index % CHART_COLOR_VARS.length];
  return readCssVar(name);
}

/** Subtle fill under the line (same hue, low alpha) for Canvas. */
export function chartFillForStroke(stroke: string): string {
  return withAlpha(stroke, 0.18);
}

function axisFont(): string {
  if (typeof document === 'undefined') {
    return '12px sans-serif';
  }
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  return `11px ${family}`;
}

export function createSignalUPlotOpts(opts: {
  width: number;
  height: number;
  stroke: string;
  fill: string;
}): uPlot.Options {
  const fg = readCssVar('--vscode-descriptionForeground');
  const gridStroke = withAlpha(readCssVar('--vscode-foreground'), 0.12);

  return {
    width: opts.width,
    height: opts.height,
    class: 'signal-lab-uplot',
    legend: { show: false },
    cursor: { show: false },
    ms: 1,
    scales: {
      x: { time: true },
      y: { auto: true },
    },
    series: [
      {},
      {
        stroke: opts.stroke,
        fill: opts.fill,
        width: 2,
        points: { show: false },
      },
    ],
    axes: [
      {
        stroke: fg,
        grid: { show: true, stroke: gridStroke, width: 1 },
        ticks: { stroke: fg },
        font: axisFont(),
      },
      {
        stroke: fg,
        grid: { show: true, stroke: gridStroke, width: 1 },
        ticks: { stroke: fg },
        font: axisFont(),
        size: 44,
      },
    ],
  };
}
