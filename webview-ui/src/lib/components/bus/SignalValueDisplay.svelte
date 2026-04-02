<script lang="ts">
  /**
   * Compact display of a single decoded signal value.
   */
  import type { DecodedSignalValue } from '../../types';

  interface Props {
    signal: DecodedSignalValue;
  }

  let { signal }: Props = $props();
</script>

<span class="signal-value" title="{signal.signalName}: raw={signal.rawValue}">
  <span class="name">{signal.signalName}</span>=<span class="value"
    >{signal.physicalValue.toFixed(2)}</span
  >{#if signal.unit}<span class="unit">{signal.unit}</span>{/if}
</span>

<style>
  .signal-value {
    display: inline-flex;
    align-items: baseline;
    gap: 1px;
    font-size: 0.9em;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 0 4px;
    border-radius: 2px;
    white-space: nowrap;
  }

  .name {
    opacity: 0.75;
    font-size: 0.85em;
  }

  .value {
    font-weight: 600;
  }

  .unit {
    opacity: 0.6;
    font-size: 0.8em;
    margin-left: 1px;
  }
</style>
