<script lang="ts">
  /**
   * CAN message transmit panel.
   * Bidirectional payload editing: physical values per signal (DBC) ↔ raw bytes (strict hex).
   * Form state persists in {@link transmitFormStore} across tab switches; periodic payload and interval
   * updates sync to the extension without stopping the timer.
   */
  import { get } from 'svelte/store';
  import type { MessageDescriptor, SignalDescriptor } from '../../types';
  import { isConnected } from '../../stores/connectionStore';
  import { signalLabContextStore } from '../../stores/signalLabContextStore';
  import { transmitFormStore } from '../../stores/transmitFormStore';
  import { transmitPeriodicStore } from '../../stores/transmitPeriodicStore';
  import { vscode } from '../../vscode';
  import SearchFilter from '../shared/SearchFilter.svelte';
  import {
    bytesFromHexString,
    decodePhysical,
    decodeRawInteger,
    encodePhysical,
    formatPayloadHex,
    sanitizeHexDigits,
  } from '../../transmitCodec';

  interface Props {
    messages: MessageDescriptor[];
  }

  let { messages }: Props = $props();

  let periodicMessageIds = $derived(
    Object.keys($transmitPeriodicStore.intervals)
      .map(Number)
      .sort((a, b) => a - b),
  );

  let filteredMessages = $derived.by(() => {
    const filterText = $transmitFormStore.filterText;
    if (!filterText) return messages;
    const lower = filterText.toLowerCase();
    return messages.filter(
      (m) => m.name.toLowerCase().includes(lower) || m.id.toString(16).includes(lower),
    );
  });

  let selectedMessage = $derived.by(() => {
    const id = $transmitFormStore.selectedMessageId;
    if (id === null) return null;
    return messages.find((m) => m.id === id) ?? null;
  });

  /** Payload bytes for the current message (persisted per message id). */
  let payload = $derived.by(() => {
    const m = selectedMessage;
    if (!m) return [];
    const map = $transmitFormStore.payloadByMessageId;
    const existing = map[m.id];
    if (existing && existing.length === m.dlc) {
      return [...existing];
    }
    return Array.from({ length: m.dlc }, () => 0);
  });

  function selectMessage(msg: MessageDescriptor) {
    transmitFormStore.setSelectedMessageId(msg.id);
  }

  function syncPeriodicPayloadIfRunning(messageId: number, data: number[]): void {
    if (get(transmitPeriodicStore).intervals[messageId] !== undefined) {
      vscode.postMessage({ type: 'transmit.updatePeriodicPayload', messageId, data });
    }
  }

  function handleHexInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const cleaned = sanitizeHexDigits(el.value);
    if (selectedMessage) {
      const bytes = bytesFromHexString(cleaned, selectedMessage.dlc);
      transmitFormStore.setPayload(selectedMessage.id, bytes);
      syncPeriodicPayloadIfRunning(selectedMessage.id, bytes);
    }
  }

  function applySignalPhysical(sig: SignalDescriptor, physical: number) {
    if (!selectedMessage || Number.isNaN(physical)) return;
    const buf = new Uint8Array(
      transmitFormStore.getPayload(selectedMessage.id, selectedMessage.dlc),
    );
    encodePhysical(sig, physical, buf);
    const bytes = [...buf];
    transmitFormStore.setPayload(selectedMessage.id, bytes);
    syncPeriodicPayloadIfRunning(selectedMessage.id, bytes);
  }

  function stepFor(sig: SignalDescriptor): string {
    const f = Math.abs(sig.factor);
    if (f === 0 || !Number.isFinite(f)) return 'any';
    if (f >= 1) return String(f);
    const s = f.toString();
    return s.includes('e') ? 'any' : s;
  }

  function parseDataHex(): number[] {
    return [...payload];
  }

  function intervalMsFromValueAndUnit(v: number, u: 's' | 'ms'): number {
    if (u === 's') {
      return Math.max(1, Math.round(v * 1000));
    }
    return Math.max(1, Math.round(v));
  }

  function getIntervalMs(): number {
    return intervalMsFromValueAndUnit(
      $transmitFormStore.intervalValue,
      $transmitFormStore.intervalUnit,
    );
  }

  function syncPeriodicIntervalIfRunning(messageId: number, ms: number): void {
    if (get(transmitPeriodicStore).intervals[messageId] !== undefined) {
      vscode.postMessage({
        type: 'transmit.updatePeriodicInterval',
        messageId,
        intervalMs: ms,
      });
      transmitPeriodicStore.updateInterval(messageId, ms);
    }
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
    const ctx = get(signalLabContextStore);
    if (ctx.connectionMode === 'virtual_simulation' && ctx.virtualSimulationRunning) {
      vscode.postMessage({
        type: 'virtualBus.inject',
        messageId: selectedMessage.id,
        data: parseDataHex(),
      });
      return;
    }
    vscode.postMessage({
      type: 'transmit.send',
      messageId: selectedMessage.id,
      data: parseDataHex(),
    });
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
      const data = parseDataHex();
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

  function physicalValue(sig: SignalDescriptor): number {
    return decodePhysical(sig, new Uint8Array(payload));
  }

  function rawValue(sig: SignalDescriptor): number {
    return decodeRawInteger(sig, new Uint8Array(payload));
  }

  /** Clear selection if the active database no longer defines this message id. */
  $effect(() => {
    const id = $transmitFormStore.selectedMessageId;
    if (id !== null && !messages.some((m) => m.id === id)) {
      transmitFormStore.setSelectedMessageId(null);
    }
  });
</script>

<div class="transmit-panel">
  <div class="toolbar">
    <SearchFilter
      placeholder="Filter messages…"
      onFilter={(t) => transmitFormStore.setFilterText(t)}
    />
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
            <button type="button" class="btn-stop-one" onclick={() => stopPeriodicForId(id)}
              >Stop</button
            >
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="content">
    <div class="message-list">
      {#each filteredMessages as msg (msg.id)}
        <button
          class="message-item"
          class:selected={$transmitFormStore.selectedMessageId === msg.id}
          onclick={() => selectMessage(msg)}
        >
          <span class="msg-id">0x{msg.id.toString(16).toUpperCase().padStart(3, '0')}</span>
          <span class="msg-name">{msg.name}</span>
          {#if msg.isFd}
            <span class="fd-badge" title="CAN FD message">FD</span>
          {/if}
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
            No frames are defined in the active database. Load a different DBC as the active
            database for decode, or add messages in the CAN Database Editor.
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
          <span
            >Payload (hex, {selectedMessage.dlc} byte{selectedMessage.dlc === 1 ? '' : 's'})</span
          >
          <input
            type="text"
            class="hex-input"
            inputmode="text"
            autocomplete="off"
            spellcheck="false"
            maxlength={selectedMessage.dlc * 3 - 1}
            aria-label="Payload bytes as hexadecimal pairs"
            value={formatPayloadHex(payload)}
            oninput={handleHexInput}
          />
          <span class="field-hint"
            >Digits 0–9 and A–F only; spaces optional. Values persist when you switch tabs. Editing
            payload, signals, or repeat interval updates the running periodic transmit for this
            frame without stop/start. Signal fields below decode from this payload.</span
          >
        </label>

        <div class="field interval-field">
          <span>Repeat every</span>
          <div class="interval-row">
            <input
              type="number"
              value={$transmitFormStore.intervalValue}
              min={$transmitFormStore.intervalUnit === 's' ? 0.001 : 1}
              step={$transmitFormStore.intervalUnit === 's' ? 0.001 : 1}
              title={$transmitFormStore.intervalUnit === 's'
                ? 'Interval in seconds'
                : 'Interval in milliseconds'}
              oninput={(e) => {
                const v = +e.currentTarget.value;
                const u = $transmitFormStore.intervalUnit;
                transmitFormStore.setInterval(v, u);
                if (selectedMessage) {
                  syncPeriodicIntervalIfRunning(
                    selectedMessage.id,
                    intervalMsFromValueAndUnit(v, u),
                  );
                }
              }}
            />
            <select
              value={$transmitFormStore.intervalUnit}
              class="interval-unit"
              title="Time unit"
              onchange={(e) => {
                const u = e.currentTarget.value as 's' | 'ms';
                const v = $transmitFormStore.intervalValue;
                transmitFormStore.setInterval(v, u);
                if (selectedMessage) {
                  syncPeriodicIntervalIfRunning(
                    selectedMessage.id,
                    intervalMsFromValueAndUnit(v, u),
                  );
                }
              }}
            >
              <option value="s">seconds</option>
              <option value="ms">milliseconds</option>
            </select>
          </div>
          <span class="field-hint"
            >Sends about once every {getIntervalMs()} ms ({(getIntervalMs() / 1000).toFixed(3)} s)</span
          >
        </div>

        <div class="actions">
          <button onclick={handleSendOnce} disabled={!$isConnected} title="Send message once">
            Send once
          </button>
          <button
            onclick={handleTogglePeriodic}
            disabled={!$isConnected}
            class:btn-periodic-on={$transmitPeriodicStore.intervals[selectedMessage.id] !==
              undefined}
          >
            {$transmitPeriodicStore.intervals[selectedMessage.id] !== undefined
              ? 'Stop periodic for this message'
              : 'Start periodic'}
          </button>
        </div>

        {#if selectedMessage.signals.length > 0}
          <div class="signal-summary">
            <h4>Signals (physical)</h4>
            <p class="signal-hint">
              Edit a value to pack it into the payload using factor, offset, and bit layout from the
              DBC. Raw column shows the integer raw before scaling.
            </p>
            {#each selectedMessage.signals as sig}
              <div class="signal-row">
                <div class="sig-header">
                  <span class="sig-name">{sig.name}</span>
                  <span class="sig-meta"
                    >{sig.byteOrder === 'little_endian' ? 'Intel' : 'Motorola'} · [{sig.startBit}:{sig.bitLength}]</span
                  >
                </div>
                <div class="sig-input-row">
                  <input
                    type="number"
                    class="sig-value-input"
                    step={stepFor(sig)}
                    value={physicalValue(sig)}
                    onchange={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      if (!Number.isNaN(v)) applySignalPhysical(sig, v);
                    }}
                    aria-label="Physical value for {sig.name}"
                  />
                  {#if sig.unit}
                    <span class="sig-unit">{sig.unit}</span>
                  {/if}
                  <span class="sig-raw" title="Raw integer (decoded from payload)"
                    >raw {rawValue(sig)}</span
                  >
                </div>
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
    flex: 1;
    min-height: 0;
    gap: 8px;
  }

  .periodic-banner {
    flex-shrink: 0;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid
      color-mix(in srgb, var(--vscode-charts-green) 45%, var(--vscode-widget-border));
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

  .fd-badge {
    font-size: 0.65em;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
    color: var(--vscode-charts-blue);
    white-space: nowrap;
    flex-shrink: 0;
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

  .hex-input {
    letter-spacing: 0.02em;
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

  .signal-hint {
    margin: 0 0 8px 0;
    font-size: 0.82em;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
  }

  .signal-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 80%, transparent);
    font-size: 0.9em;
  }

  .signal-row:last-child {
    border-bottom: none;
  }

  .sig-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .sig-name {
    font-weight: 600;
  }

  .sig-meta {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .sig-input-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .sig-value-input {
    width: 10rem;
    min-width: 0;
  }

  .sig-unit {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
  }

  .sig-raw {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }

  .placeholder,
  .empty {
    padding: 24px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
  }
</style>
