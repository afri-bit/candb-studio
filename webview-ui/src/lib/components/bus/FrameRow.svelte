<script lang="ts">
    /**
     * A single row in the CAN monitor table, showing one decoded frame.
     */
    import type { DecodedFrameDescriptor } from '../../types';
    import SignalValueDisplay from './SignalValueDisplay.svelte';

    interface Props {
        decoded: DecodedFrameDescriptor;
    }

    let { decoded }: Props = $props();

    let timeStr = $derived(decoded.frame.timestamp.toFixed(3));

    let idHex = $derived(
        `0x${decoded.frame.id.toString(16).toUpperCase().padStart(decoded.frame.isExtended ? 8 : 3, '0')}`,
    );

    let dataHex = $derived(
        decoded.frame.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
    );
</script>

<div class="frame-row">
    <span class="col-time">{timeStr}</span>
    <span class="col-id">{idHex}</span>
    <span class="col-name">{decoded.messageName}</span>
    <span class="col-dlc">{decoded.frame.dlc}</span>
    <span class="col-data">{dataHex}</span>
    <span class="col-signals">
        {#each decoded.signals as sig}
            <SignalValueDisplay signal={sig} />
        {/each}
    </span>
</div>

<style>
    .frame-row {
        display: flex;
        gap: 4px;
        padding: 1px 4px;
        border-bottom: 1px solid var(--vscode-widget-border, #222);
    }

    .frame-row:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .col-time { width: 90px; flex-shrink: 0; }
    .col-id { width: 70px; flex-shrink: 0; color: var(--vscode-charts-blue); }
    .col-name { width: 130px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-dlc { width: 35px; flex-shrink: 0; text-align: center; }
    .col-data { width: 200px; flex-shrink: 0; letter-spacing: 0.5px; }
    .col-signals { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; }
</style>
