<script lang="ts">
  /**
   * Raw classic CAN transmit: arbitration ID + DLC + payload hex — no DBC required.
   * Virtual adapter uses monitor inject path; hardware uses transmit service.
   */
  import { isConnected } from '../../stores/connectionStore';
  import { vscode } from '../../vscode';
  import { bytesFromHexString, sanitizeHexDigits } from '../../transmitCodec';

  const FD_VALID_LENGTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];

  let canIdInput = $state('0x100');
  let isExtended = $state(false);
  let isFd = $state(false);
  let isBrs = $state(true);
  let dlc = $state(8);
  let fdDlc = $state(8);
  let dataHex = $state('00 00 00 00 00 00 00 00');
  let localError = $state<string | null>(null);

  function parseCanId(s: string): number | null {
    const t = s.trim();
    if (!t) {
      return null;
    }
    if (/^0x/i.test(t)) {
      const n = parseInt(t.replace(/^0x/i, ''), 16);
      return Number.isNaN(n) ? null : n;
    }
    const dec = parseInt(t, 10);
    return Number.isNaN(dec) ? null : dec;
  }

  function sendRawOnce() {
    localError = null;
    const id = parseCanId(canIdInput);
    if (id === null) {
      localError = 'Enter a valid CAN ID (decimal or 0x hex).';
      return;
    }

    let dlcN: number;
    if (isFd) {
      dlcN = Number(fdDlc);
      if (!FD_VALID_LENGTHS.includes(dlcN)) {
        localError = `CAN FD payload size must be one of: ${FD_VALID_LENGTHS.join(', ')} bytes.`;
        return;
      }
    } else {
      dlcN = Math.max(0, Math.min(8, Math.trunc(Number(dlc))));
      if (!Number.isFinite(dlcN)) {
        localError = 'DLC must be 0–8 for classic CAN.';
        return;
      }
    }

    const cleaned = sanitizeHexDigits(dataHex);
    const data = bytesFromHexString(cleaned, dlcN);
    vscode.postMessage({
      type: 'transmit.sendRaw',
      id,
      data,
      dlc: dlcN,
      isExtended,
      isFd,
      isBrs: isFd ? isBrs : undefined,
    });
  }
</script>

<div class="raw-panel">
  <h3 class="raw-title">Raw frame (no database)</h3>
  <p class="raw-lead">
    Send a classic CAN frame by ID and payload. Works with hardware or virtual simulation — no
    <code>.dbc</code> needed. Decode in the monitor only if the active session defines this ID.
  </p>

  {#if localError}
    <p class="raw-local-error" role="alert">{localError}</p>
  {/if}

  <div class="raw-grid">
    <label class="raw-field">
      <span>CAN ID</span>
      <input
        type="text"
        class="raw-input"
        autocomplete="off"
        spellcheck="false"
        bind:value={canIdInput}
        title="Decimal or hexadecimal (0x prefix)"
        aria-label="CAN arbitration ID"
      />
    </label>

    <label class="raw-field raw-check">
      <input type="checkbox" bind:checked={isExtended} />
      <span>29-bit extended ID</span>
    </label>

    <label class="raw-field raw-check">
      <input type="checkbox" bind:checked={isFd} />
      <span>CAN FD frame</span>
    </label>

    {#if isFd}
      <label class="raw-field raw-check">
        <input type="checkbox" bind:checked={isBrs} />
        <span>BRS (bit-rate switch)</span>
      </label>

      <label class="raw-field">
        <span>Payload length (bytes)</span>
        <select class="raw-input raw-input--narrow" bind:value={fdDlc} aria-label="FD payload length">
          {#each FD_VALID_LENGTHS as len}
            <option value={len}>{len}</option>
          {/each}
        </select>
      </label>
    {:else}
      <label class="raw-field">
        <span>DLC (0–8)</span>
        <input
          type="number"
          class="raw-input raw-input--narrow"
          min="0"
          max="8"
          step="1"
          bind:value={dlc}
          aria-label="Data length code"
        />
      </label>
    {/if}

    <label class="raw-field raw-field--full">
      <span>Data (hex bytes)</span>
      <input
        type="text"
        class="raw-input raw-hex"
        autocomplete="off"
        spellcheck="false"
        bind:value={dataHex}
        aria-label="Payload as hexadecimal"
      />
    </label>
  </div>

  <div class="raw-actions">
    <button
      type="button"
      class="raw-send"
      disabled={!$isConnected}
      title={$isConnected
        ? 'Send one raw frame'
        : 'Connect hardware or start virtual simulation first'}
      onclick={sendRawOnce}
    >
      Send raw once
    </button>
  </div>
</div>

<style>
  .raw-panel {
    flex-shrink: 0;
    padding: 12px 14px 14px;
    margin-bottom: 12px;
    border: 1px solid color-mix(in srgb, var(--vscode-widget-border) 85%, transparent);
    border-radius: 6px;
    background: color-mix(
      in srgb,
      var(--vscode-sideBar-background) 40%,
      var(--vscode-editor-background)
    );
  }

  .raw-title {
    margin: 0 0 6px;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .raw-lead {
    margin: 0 0 12px;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--vscode-descriptionForeground);
  }

  .raw-lead code {
    font-size: 0.95em;
  }

  .raw-local-error {
    margin: 0 0 10px;
    font-size: 0.82rem;
    color: var(--vscode-errorForeground, var(--vscode-foreground));
  }

  .raw-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px 14px;
    align-items: end;
  }

  .raw-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.8rem;
    color: var(--vscode-descriptionForeground);
  }

  .raw-field--full {
    grid-column: 1 / -1;
  }

  .raw-check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding-top: 18px;
  }

  .raw-input {
    padding: 5px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font: inherit;
    font-size: 0.88rem;
  }

  .raw-input--narrow {
    max-width: 72px;
  }

  .raw-hex {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .raw-actions {
    margin-top: 12px;
  }

  .raw-send {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .raw-send:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .raw-send:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
