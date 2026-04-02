<script lang="ts">
    /**
     * Vector-style payload visualization with overlap detection, hover highlight, and issue banners.
     */
    import type { MessageDescriptor, SignalDescriptor } from '../../types';
    import { analyzeMessageLayout, getSignalLsbMsbPhysicalBits } from '../../bitLayoutUtils';

    interface Props {
        message: MessageDescriptor;
        onNavigateToSignal?: (messageId: number, signalName: string) => void;
    }

    let { message, onNavigateToSignal }: Props = $props();

    const PALETTE = [
        '#3b82f6',
        '#10b981',
        '#f59e0b',
        '#ef4444',
        '#8b5cf6',
        '#ec4899',
        '#06b6d4',
        '#84cc16',
        '#f97316',
        '#6366f1',
        '#14b8a6',
        '#d946ef',
    ];

    let hoveredSigIndex = $state<number | null>(null);

    let analysis = $derived(analyzeMessageLayout(message));

    let totalBits = $derived(analysis.totalBits);

    function colorForSignal(sigIndex: number): string {
        return PALETTE[sigIndex % PALETTE.length];
    }

    /** Two-color diagonal for overlap (exactly 2 signals) */
    function overlapGradient(i: number, j: number): string {
        const a = colorForSignal(i);
        const b = colorForSignal(j);
        return `linear-gradient(135deg, ${a} 0%, ${a} 45%, ${b} 55%, ${b} 100%)`;
    }

    /** Multi-signal overlap: hatched error tone + blend */
    function overlapGradientMany(indices: number[]): string {
        if (indices.length === 2) {
            return overlapGradient(indices[0], indices[1]);
        }
        const c0 = colorForSignal(indices[0]);
        const c1 = colorForSignal(indices[1]);
        const c2 = colorForSignal(indices[2] ?? indices[0]);
        return `linear-gradient(135deg, ${c0} 0%, ${c1} 33%, ${c2} 66%, ${c0} 100%)`;
    }

    function cellBackground(sigIndices: number[]): string | undefined {
        if (sigIndices.length === 0) return undefined;
        if (sigIndices.length === 1) return colorForSignal(sigIndices[0]);
        return overlapGradientMany(sigIndices);
    }

    function isHighlighted(sigIndices: number[]): boolean {
        if (hoveredSigIndex === null) return false;
        return sigIndices.includes(hoveredSigIndex);
    }

    function isDimmed(sigIndices: number[]): boolean {
        if (hoveredSigIndex === null) return false;
        if (sigIndices.length === 0) return true;
        return !sigIndices.includes(hoveredSigIndex);
    }

    let gridRows = $derived.by(() => {
        const rows: (typeof analysis.cells)[] = [];
        for (let byte = 0; byte < message.dlc; byte++) {
            rows.push(analysis.cells.slice(byte * 8, byte * 8 + 8));
        }
        return rows;
    });

    /** Overview segments — one bar per signal (may visually overlap) */
    let overviewSegments = $derived.by(() => {
        type Seg = {
            sig: SignalDescriptor;
            sigIndex: number;
            start: number;
            end: number;
            hasOverlap: boolean;
        };
        const segs: Seg[] = [];
        const overlapSet = new Set(analysis.overlapBits);
        message.signals.forEach((sig, sigIdx) => {
            const start = sig.startBit;
            const end = sig.startBit + sig.bitLength - 1;
            if (sig.bitLength <= 0) return;
            if (end < 0 || start >= totalBits) return;
            const s = Math.max(0, start);
            const e = Math.min(totalBits - 1, end);
            let hasOverlap = false;
            for (let b = s; b <= e; b++) {
                if (overlapSet.has(b)) {
                    hasOverlap = true;
                    break;
                }
            }
            segs.push({ sig, sigIndex: sigIdx, start: s, end: e, hasOverlap });
        });
        return segs;
    });

    function pct(n: number): string {
        return `${(100 * n) / Math.max(1, totalBits)}%`;
    }

    function segmentLeft(start: number): string {
        return pct(start);
    }

    function segmentWidth(start: number, end: number): string {
        return pct(end - start + 1);
    }

    function setHover(i: number | null) {
        hoveredSigIndex = i;
    }

    const errIssues = $derived(analysis.issues.filter((x) => x.kind === 'error'));
    const warnIssues = $derived(analysis.issues.filter((x) => x.kind === 'warning'));

    function lsbMsb(sig: SignalDescriptor): { lsb: number; msb: number } {
        return getSignalLsbMsbPhysicalBits(sig);
    }

    /** Arrow from LSB toward MSB along physical bit index (overview & LSB cell). */
    function arrowSymbol(sig: SignalDescriptor): string {
        const { lsb, msb } = lsbMsb(sig);
        if (lsb === msb) return '';
        return lsb < msb ? '→' : '←';
    }

    /** lsb/msb tag for a grid cell when exactly one signal occupies it. */
    function cellBitEndLabel(
        cellBit: number,
        sig: SignalDescriptor,
    ): 'lsb' | 'msb' | 'lsb/msb' | null {
        const { lsb, msb } = lsbMsb(sig);
        if (lsb === msb && cellBit === lsb) return 'lsb/msb';
        if (cellBit === lsb) return 'lsb';
        if (cellBit === msb) return 'msb';
        return null;
    }

    function singleSigTitle(sig: SignalDescriptor, cellBit: number): string {
        const { lsb, msb } = lsbMsb(sig);
        return `${sig.name} · bit ${cellBit} · LSB ${lsb} · MSB ${msb}`;
    }
</script>

<div class="bit-layout dbc-card">
    <div class="dbc-card-header">
        <span>Payload layout</span>
        <span class="meta">
            <span class="dbc-pill">{message.name}</span>
            <span class="id">0x{message.id.toString(16).toUpperCase()}</span>
            <span class="dlc">DLC {message.dlc}</span>
        </span>
    </div>

    <div class="dbc-card-body">
        {#if errIssues.length > 0}
            <div class="banner error" role="alert">
                {#each errIssues as iss}
                    <div>{iss.message}</div>
                    {#if iss.signalNames?.length}
                        <div class="names">{iss.signalNames.join(', ')}</div>
                    {/if}
                {/each}
            </div>
        {/if}

        {#if warnIssues.length > 0}
            <div class="banner warn" role="status">
                {#each warnIssues as iss}
                    <div>{iss.message}</div>
                {/each}
            </div>
        {/if}

        <p class="hint">
            Linear bit indices 0…(DLC×8−1). Endpoint cells show <strong>lsb</strong> /
            <strong>msb</strong> (or both for a 1-bit field), then the bit index. The arrow points from
            LSB toward MSB along the bus index. Hover a signal in the legend or layout to highlight it.
        </p>

        <div class="overview-wrap" class:dim={hoveredSigIndex !== null} aria-hidden="true">
            <div class="overview-rail" style:width="100%">
                <div class="overview-track">
                    {#each overviewSegments as seg}
                        {@const lm = lsbMsb(seg.sig)}
                        <div
                            class="overview-seg"
                            class:overlap={seg.hasOverlap}
                            class:dim-seg={hoveredSigIndex !== null &&
                                hoveredSigIndex !== seg.sigIndex}
                            class:hover-seg={hoveredSigIndex === seg.sigIndex}
                            style:left={segmentLeft(seg.start)}
                            style:width={segmentWidth(seg.start, seg.end)}
                            style:background-color={colorForSignal(seg.sigIndex)}
                            style:z-index={seg.sigIndex}
                            title="{seg.sig
                                .name} — bits {seg.start}…{seg.end} · LSB @ {lm.lsb}, MSB @ {lm.msb}{seg.hasOverlap
                                ? ' · overlap'
                                : ''}"
                            onmouseenter={() => setHover(seg.sigIndex)}
                            onmouseleave={() => setHover(null)}
                            role="presentation"
                        >
                            <span class="overview-inner">
                                <span class="overview-label">{seg.sig.name}</span>
                                {#if seg.sig.bitLength > 1}
                                    <span class="overview-arrow" aria-hidden="true"
                                        >{arrowSymbol(seg.sig)}</span
                                    >
                                {/if}
                            </span>
                        </div>
                    {/each}
                </div>
                <div class="overview-scale">
                    {#each Array(message.dlc) as _, bi}
                        <span class="byte-tick" style="width: {pct(8)}">{bi}</span>
                    {/each}
                </div>
            </div>
        </div>

        <div class="grid-header">
            <span class="corner"></span>
            {#each [7, 6, 5, 4, 3, 2, 1, 0] as bitInByte}
                <span class="bit-col-h">b{bitInByte}</span>
            {/each}
        </div>

        <div class="grid-wrap" class:dim={hoveredSigIndex !== null}>
            {#each gridRows as row}
                <div class="byte-row">
                    <span class="byte-label">Byte {Math.floor(row[0].bit / 8)}</span>
                    {#each row as cell}
                        {@const sigs = cell.sigIndices}
                        {@const overlap = sigs.length > 1}
                        {@const bg = cellBackground(sigs)}
                        {@const oneSig = sigs.length === 1 ? message.signals[sigs[0]] : null}
                        {@const endTag = oneSig ? cellBitEndLabel(cell.bit, oneSig) : null}
                        {@const showFlowArrow =
                            oneSig &&
                            oneSig.bitLength > 1 &&
                            endTag === 'lsb' &&
                            arrowSymbol(oneSig)}
                        <div
                            class="bit-cell"
                            class:occupied={sigs.length > 0}
                            class:overlap
                            class:unallocated={sigs.length === 0}
                            class:highlight={isHighlighted(sigs)}
                            class:dim-cell={isDimmed(sigs)}
                            class:has-bit-tag={endTag !== null}
                            style:background={bg}
                            style:opacity={sigs.length === 0 ? 1 : overlap ? 1 : 0.95}
                            title={sigs.length === 0
                                ? `Bit ${cell.bit} — unallocated`
                                : sigs.length === 1 && oneSig
                                  ? singleSigTitle(oneSig, cell.bit)
                                  : `Overlap: ${sigs.map((i) => message.signals[i]?.name).join(' + ')} · bit ${cell.bit}`}
                            onmouseenter={() =>
                                sigs.length === 1 ? setHover(sigs[0]) : setHover(null)}
                            onmouseleave={() => setHover(null)}
                            role="gridcell"
                            tabindex="-1"
                        >
                            <div class="bit-cell-stack">
                                {#if endTag}
                                    <span class="bit-role">{endTag}</span>
                                {/if}
                                <span class="bit-num">{cell.bit}</span>
                                {#if showFlowArrow}
                                    <span class="bit-flow-arrow" aria-hidden="true"
                                        >{showFlowArrow}</span
                                    >
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/each}
        </div>

        {#if message.signals.length > 0}
            <div class="legend">
                <div class="legend-title">Signals in this message</div>
                <div class="legend-grid">
                    {#each message.signals as sig, i}
                        {@const pair = analysis.overlapPairs.find((p) => p.i === i || p.j === i)}
                        <button
                            type="button"
                            class="legend-card"
                            class:hovered={hoveredSigIndex === i}
                            style:--sig-color={colorForSignal(i)}
                            onclick={() => onNavigateToSignal?.(message.id, sig.name)}
                            onmouseenter={() => setHover(i)}
                            onmouseleave={() => setHover(null)}
                        >
                            <span class="swatch"></span>
                            <span class="name">{sig.name}</span>
                            {#if pair}
                                <span class="overlap-badge" title="Overlaps with another signal"
                                    >Overlap</span
                                >
                            {/if}
                            <span class="range">
                                {#if sig.bitLength <= 1}
                                    len {sig.bitLength} · LSB/MSB @ {lsbMsb(sig).lsb}
                                {:else}
                                    len {sig.bitLength} · LSB @{lsbMsb(sig).lsb}
                                    {arrowSymbol(sig)} MSB @{lsbMsb(sig).msb}
                                {/if}
                            </span>
                            {#if sig.unit}
                                <span class="unit">{sig.unit}</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .bit-layout {
        margin-top: 10px;
    }

    .banner {
        padding: 10px 12px;
        border-radius: 6px;
        margin-bottom: 12px;
        font-size: 12px;
        line-height: 1.45;
    }

    .banner.error {
        background: color-mix(
            in srgb,
            var(--vscode-inputValidation-errorBackground) 85%,
            transparent
        );
        border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c);
        color: var(--vscode-errorForeground);
    }

    .banner.warn {
        background: color-mix(
            in srgb,
            var(--vscode-inputValidation-warningBackground) 85%,
            transparent
        );
        border: 1px solid var(--vscode-inputValidation-warningBorder, #cca700);
        color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
    }

    .banner .names {
        margin-top: 4px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
    }

    .meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 12px;
        font-weight: 600;
    }

    .meta .id {
        font-family: var(--vscode-editor-font-family, monospace);
        color: var(--vscode-descriptionForeground);
    }

    .meta .dlc {
        color: var(--vscode-descriptionForeground);
        font-weight: 500;
    }

    .hint {
        margin: 0 0 12px 0;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.4;
    }

    .overview-wrap.dim .overview-seg.dim-seg:not(.hover-seg) {
        opacity: 0.35;
    }

    .overview-wrap {
        margin-bottom: 16px;
    }

    .overview-rail {
        position: relative;
    }

    .overview-track {
        position: relative;
        height: 40px;
        border-radius: 6px;
        background: color-mix(
            in srgb,
            var(--vscode-editor-background) 92%,
            var(--vscode-input-background)
        );
        border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
        overflow: visible;
    }

    .overview-seg {
        position: absolute;
        top: 0;
        height: 100%;
        min-width: 2px;
        padding: 0;
        box-sizing: border-box;
        border-radius: 4px;
        border: 1px solid color-mix(in srgb, var(--vscode-widget-shadow) 40%, transparent);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
        cursor: default;
        transition:
            opacity 0.12s ease,
            box-shadow 0.12s ease,
            transform 0.12s ease;
    }

    .overview-inner {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 2px;
        padding: 3px 6px 5px;
        box-sizing: border-box;
    }

    .overview-seg.overlap {
        box-shadow: inset 0 0 0 2px rgba(255, 80, 80, 0.85);
    }

    .overview-seg.hover-seg {
        opacity: 1 !important;
        z-index: 100 !important;
        transform: scaleY(1.08);
        box-shadow:
            0 0 0 2px var(--vscode-focusBorder),
            0 4px 12px rgba(0, 0, 0, 0.25);
    }

    .overview-label {
        font-size: 0.72em;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
        max-width: 100%;
    }

    .overview-arrow {
        font-size: 0.85em;
        font-weight: 700;
        line-height: 1;
        opacity: 0.95;
        pointer-events: none;
    }

    .overview-scale {
        display: flex;
        margin-top: 4px;
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
    }

    .byte-tick {
        text-align: center;
        border-left: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
        box-sizing: border-box;
    }

    .byte-tick:first-child {
        border-left: none;
    }

    .grid-header {
        display: flex;
        margin-left: 56px;
        gap: 0;
        margin-bottom: 2px;
    }

    .corner {
        width: 0;
    }

    .bit-col-h {
        flex: 1;
        min-width: 0;
        text-align: center;
        font-size: 10px;
        color: var(--vscode-descriptionForeground);
    }

    .grid-wrap.dim .bit-cell.dim-cell {
        opacity: 0.32;
    }

    .grid-wrap.dim .bit-cell.highlight {
        opacity: 1 !important;
        box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        z-index: 2;
        transform: scale(1.02);
    }

    .byte-row {
        display: flex;
        align-items: stretch;
        gap: 0;
        margin-bottom: 2px;
    }

    .byte-label {
        width: 52px;
        flex-shrink: 0;
        text-align: right;
        padding-right: 8px;
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
        display: flex;
        align-items: center;
        justify-content: flex-end;
    }

    .bit-cell {
        flex: 1;
        min-width: 0;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
        border-radius: 3px;
        background: color-mix(
            in srgb,
            var(--vscode-editor-background) 92%,
            var(--vscode-input-background)
        );
        font-size: 0.65rem;
        cursor: default;
        transition:
            opacity 0.12s ease,
            box-shadow 0.12s ease,
            transform 0.1s ease;
    }

    .bit-cell-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        line-height: 1.15;
        width: 100%;
        min-height: 0;
    }

    .bit-role {
        font-size: 0.58em;
        font-weight: 700;
        text-transform: lowercase;
        letter-spacing: 0.02em;
        opacity: 0.92;
        pointer-events: none;
    }

    .bit-flow-arrow {
        font-size: 0.75em;
        font-weight: 800;
        line-height: 1;
        margin-top: 1px;
        pointer-events: none;
    }

    .bit-cell.unallocated {
        background: repeating-linear-gradient(
            -45deg,
            color-mix(in srgb, var(--vscode-editor-background) 88%, #888),
            color-mix(in srgb, var(--vscode-editor-background) 88%, #888) 4px,
            color-mix(in srgb, var(--vscode-editor-background) 94%, #666) 4px,
            color-mix(in srgb, var(--vscode-editor-background) 94%, #666) 8px
        );
    }

    .bit-cell.occupied {
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
        font-weight: 600;
    }

    .bit-cell.overlap {
        border-color: rgba(255, 100, 100, 0.9);
        box-shadow: inset 0 0 0 1px rgba(255, 60, 60, 0.5);
    }

    .bit-num {
        opacity: 0.95;
        font-variant-numeric: tabular-nums;
        pointer-events: none;
    }

    .legend {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
    }

    .legend-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 8px;
    }

    .legend-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 8px;
    }

    .legend-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
        background: var(--vscode-editor-background);
        color: inherit;
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        transition:
            border-color 0.12s ease,
            box-shadow 0.12s ease;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        position: relative;
    }

    .legend-card:hover,
    .legend-card.hovered {
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .legend-card .swatch {
        width: 100%;
        height: 6px;
        border-radius: 2px;
        background: var(--sig-color);
    }

    .legend-card .name {
        font-weight: 600;
        font-size: 13px;
    }

    .overlap-badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-errorForeground);
        background: color-mix(
            in srgb,
            var(--vscode-inputValidation-errorBackground) 60%,
            transparent
        );
        padding: 2px 6px;
        border-radius: 4px;
    }

    .legend-card .range {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
    }

    .legend-card .unit {
        font-size: 11px;
        font-family: var(--vscode-editor-font-family, monospace);
        color: var(--vscode-foreground);
    }
</style>
