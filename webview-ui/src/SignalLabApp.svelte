<script lang="ts">
  /**
   * CAN Signal Lab: title → ribbon → tabs → content. Theme tokens follow VS Code light/dark.
   */
  import { vscode } from './lib/vscode';
  import { databaseStore } from './lib/stores/databaseStore';
  import { documentUri } from './lib/stores/editorContext';
  import { connectionStore, isConnected } from './lib/stores/connectionStore';
  import { monitorStore } from './lib/stores/monitorStore';
  import { transmitPeriodicStore } from './lib/stores/transmitPeriodicStore';
  import { signalLabContextStore } from './lib/stores/signalLabContextStore';
  import { signalChartStore } from './lib/stores/signalChartStore';
  import MonitorPanel from './lib/components/bus/MonitorPanel.svelte';
  import RawTransmitPanel from './lib/components/bus/RawTransmitPanel.svelte';
  import TransmitPanel from './lib/components/bus/TransmitPanel.svelte';
  import SignalChartPanel from './lib/components/bus/SignalChartPanel.svelte';
  import type { WebviewInboundMessage } from './lib/types';

  const INTRO_STORAGE_KEY = 'candb-studio.signalLab.introDismissed';

  type Tab = 'monitor' | 'transmit' | 'charts';

  let activeTab: Tab = $state('monitor');
  let sessionUris = $state<string[]>([]);
  let activeBusUri = $state<string | null>(null);
  let showIntro = $state(false);
  let signalLabError = $state<string | null>(null);

  function readIntroDismissed(): boolean {
    try {
      return localStorage.getItem(INTRO_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function dismissIntro() {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    showIntro = false;
  }

  function displayPath(uri: string): string {
    try {
      if (uri.startsWith('file://')) {
        const u = new URL(uri);
        return decodeURIComponent(u.pathname);
      }
    } catch {
      /* fall through */
    }
    return uri;
  }

  function shortName(uri: string): string {
    try {
      const path = uri.includes('://') ? new URL(uri).pathname : uri;
      const seg = path.split(/[/\\]/).filter(Boolean).pop();
      return seg ? decodeURIComponent(seg) : uri;
    } catch {
      return uri;
    }
  }

  function onSessionChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    vscode.postMessage({ type: 'signalLab.setActiveDatabaseUri', uri: v === '' ? null : v });
  }

  function unlinkDecodeDatabase() {
    vscode.postMessage({ type: 'signalLab.setActiveDatabaseUri', uri: null });
  }

  function openDatabase() {
    vscode.postMessage({ type: 'signalLab.openDatabase' });
  }

  function toggleMonitor() {
    if (!$isConnected) return;
    if ($monitorStore.isRunning) {
      vscode.postMessage({ type: 'monitor.stop' });
    } else {
      vscode.postMessage({ type: 'monitor.start' });
    }
  }

  $effect(() => {
    showIntro = !readIntroDismissed();
  });

  $effect(() => {
    const handler = (event: MessageEvent<WebviewInboundMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'database.update':
          documentUri.set(message.documentUri);
          databaseStore.setDatabase(message.database);
          break;
        case 'signalLab.context':
          sessionUris = message.sessions;
          activeBusUri = message.activeUri;
          monitorStore.setRunning(message.monitorRunning);
          transmitPeriodicStore.syncFromExtension(message.periodicIntervals);
          signalLabContextStore.set({
            connectionMode: message.connectionMode,
            virtualSimulationRunning: message.virtualSimulationRunning,
          });
          break;
        case 'signalLab.error':
          signalLabError = message.message;
          break;
        case 'monitor.frame':
          monitorStore.addFrame(message.frame);
          // Charts plot decoded physical values for both Rx (bus) and Tx (loopback echo).
          // Rx-only would leave charts empty whenever traffic is classified as transmit echo.
          signalChartStore.appendFromFrame(message.frame);
          break;
        case 'monitor.clear':
          monitorStore.clear();
          signalChartStore.clear();
          break;
        case 'connection.stateChanged':
          connectionStore.setState(message.state, message.adapterType);
          if (message.state === 'disconnected') {
            transmitPeriodicStore.stopAll();
            signalLabContextStore.set({
              connectionMode: 'disconnected',
              virtualSimulationRunning: false,
            });
          }
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'database.ready' });

    return () => window.removeEventListener('message', handler);
  });
</script>

<div class="signal-lab">
  {#if signalLabError}
    <div class="signal-lab-error" role="alert">
      <span>{signalLabError}</span>
      <button
        type="button"
        class="ribbon-btn ribbon-btn--ghost"
        onclick={() => (signalLabError = null)}>Dismiss</button
      >
    </div>
  {/if}

  {#if showIntro}
    <div class="intro-banner" role="status">
      <div class="intro-copy">
        <strong>Signal Lab</strong> — connect hardware from the status bar or use
        <strong>Start virtual simulation</strong>. Use <strong>Transmit → Raw frame</strong> without
        a database, or load a <code>.dbc</code> for named messages and decode.
      </div>
      <button type="button" class="intro-dismiss" onclick={dismissIntro}>Got it</button>
    </div>
  {/if}

  <header class="lab-chrome">
    <h1 class="lab-title">CAN Signal Lab</h1>

    <div class="lab-ribbon" role="toolbar" aria-label="Signal Lab actions">
      <div class="ribbon-cluster ribbon-cluster--virtual" aria-label="Virtual bus simulation">
        {#if $signalLabContextStore.connectionMode === 'hardware'}
          <span
            class="ribbon-hint"
            title="Disconnect hardware (status bar) before virtual simulation"
            >Hardware connected — disconnect to use virtual</span
          >
        {:else if $signalLabContextStore.virtualSimulationRunning}
          <button
            type="button"
            class="ribbon-btn"
            title="Stop synthetic session; monitor stops; auto-connected bus disconnects"
            onclick={() => {
              signalLabError = null;
              vscode.postMessage({ type: 'virtualBus.stop' });
            }}>Stop virtual simulation</button
          >
        {:else}
          <button
            type="button"
            class="ribbon-btn ribbon-btn--accent"
            title="Creates a software CAN adapter if needed, then starts the session and monitor"
            onclick={() => {
              signalLabError = null;
              vscode.postMessage({ type: 'virtualBus.start' });
            }}>Start virtual simulation</button
          >
        {/if}
      </div>

      <div class="ribbon-cluster ribbon-cluster--primary">
        <button
          type="button"
          class="ribbon-btn ribbon-btn--accent"
          disabled={!$isConnected}
          title={$isConnected
            ? $monitorStore.isRunning
              ? 'Stop decoding bus traffic into the monitor'
              : 'Start decoding bus traffic into the monitor'
            : 'Connect hardware (status bar) or start virtual simulation first'}
          onclick={toggleMonitor}
        >
          {#if $monitorStore.isRunning}
            <span class="ribbon-icon" aria-hidden="true">■</span> Stop monitor
          {:else}
            <span class="ribbon-icon" aria-hidden="true">▶</span> Start monitor
          {/if}
        </button>
        <button
          type="button"
          class="ribbon-btn"
          title="Open a CAN database file"
          onclick={openDatabase}
        >
          Load CAN database…
        </button>
      </div>

      <div class="ribbon-cluster ribbon-cluster--session">
        <label class="ribbon-label" for="dbc-session">Decode session</label>
        <select
          id="dbc-session"
          class="ribbon-select"
          value={activeBusUri ?? ''}
          onchange={onSessionChange}
          disabled={sessionUris.length === 0}
          title={activeBusUri ? displayPath(activeBusUri) : 'Raw frames only — no DBC decode'}
        >
          {#if sessionUris.length === 0}
            <option value="">No database in memory</option>
          {:else}
            <option value="">— Raw only (unlink decode) —</option>
            {#each sessionUris as u (u)}
              <option value={u} title={displayPath(u)}>{shortName(u)}</option>
            {/each}
          {/if}
        </select>
        {#if activeBusUri}
          <span class="ribbon-file" title={displayPath(activeBusUri)}
            >{shortName(activeBusUri)}</span
          >
          <button
            type="button"
            class="ribbon-btn ribbon-btn--ghost"
            title="Stop using the DBC for decode; monitor shows raw bytes only"
            onclick={unlinkDecodeDatabase}
          >
            Unlink
          </button>
        {/if}
      </div>

      <div class="ribbon-cluster ribbon-cluster--meta">
        {#if $signalLabContextStore.connectionMode === 'virtual_simulation'}
          <span class="ribbon-hint" title="Software-only CAN — not a vehicle bus"
            >Bus: virtual (software)</span
          >
        {:else if $signalLabContextStore.connectionMode === 'hardware'}
          <span class="ribbon-hint" title="Real CAN adapter">Bus: hardware</span>
        {:else if !$isConnected}
          <span class="ribbon-hint">Bus: disconnected</span>
        {/if}
        {#if $isConnected}
          {#if $monitorStore.isRunning}
            <span class="ribbon-live" title="Frames are decoded into the monitor">● Monitor on</span
            >
          {:else}
            <span class="ribbon-hint" title="Start monitor to capture frames">Monitor off</span>
          {/if}
        {/if}
      </div>
    </div>

    {#if sessionUris.length > 0 && activeBusUri === null}
      <p class="ribbon-info" role="status">
        Decode unlinked — traffic is raw ID and payload bytes. Pick a session above to attach signal
        definitions again.
      </p>
    {/if}
  </header>

  <nav class="lab-tabs" aria-label="Signal Lab panels">
    <button
      type="button"
      class:active={activeTab === 'monitor'}
      onclick={() => (activeTab = 'monitor')}>Monitor</button
    >
    <button
      type="button"
      class:active={activeTab === 'transmit'}
      onclick={() => (activeTab = 'transmit')}>Transmit</button
    >
    <button
      type="button"
      class:active={activeTab === 'charts'}
      onclick={() => (activeTab = 'charts')}>Charts</button
    >
  </nav>

  <div class="lab-body">
    {#if activeTab === 'monitor'}
      <div class="lab-panel">
        <MonitorPanel messages={$databaseStore.messages} />
      </div>
    {:else if activeTab === 'transmit'}
      <div class="lab-panel lab-panel--transmit">
        <RawTransmitPanel />
        {#if $databaseStore.messages.length > 0}
          <div class="transmit-dbc-wrap">
            <h2 class="transmit-section-title">DBC-defined messages</h2>
            <TransmitPanel messages={$databaseStore.messages} />
          </div>
        {:else}
          <p class="transmit-dbc-hint" role="status">
            Load a <code>.dbc</code> with <strong>Load CAN database…</strong> to pick named frames, edit
            signals, and use periodic transmit tied to message definitions.
          </p>
        {/if}
      </div>
    {:else}
      <div class="lab-panel charts-panel">
        {#if $databaseStore.messages.length === 0}
          <div class="tab-placeholder" role="region" aria-label="Charts require decoded signals">
            <p class="tab-placeholder-title">Load a CAN database for charts</p>
            <p class="tab-placeholder-body">
              Charts plot decoded signals from the monitor. Open a <code>.dbc</code> and select signals
              after traffic is decoded.
            </p>
            <button type="button" class="ribbon-btn ribbon-btn--accent" onclick={openDatabase}
              >Load CAN database…</button
            >
          </div>
        {:else}
          <SignalChartPanel messages={$databaseStore.messages} />
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
  }

  .signal-lab {
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-height: 0;
  }

  .lab-chrome {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--vscode-sideBar-background);
    color: var(--vscode-sideBar-foreground);
    border-bottom: 1px solid var(--vscode-sideBar-border, var(--vscode-widget-border));
  }

  .lab-title {
    margin: 0;
    padding: 10px 14px 6px;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
    border-bottom: 1px solid
      color-mix(in srgb, var(--vscode-sideBar-border, var(--vscode-widget-border)) 80%, transparent);
  }

  .lab-ribbon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    padding: 8px 12px 10px;
    background: var(--vscode-toolbar-background, var(--vscode-editorGroupHeader-tabsBackground));
    border-bottom: 1px solid var(--vscode-toolbar-border, var(--vscode-widget-border));
  }

  .ribbon-cluster {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .ribbon-cluster--primary {
    padding-right: 8px;
    border-right: 1px solid color-mix(in srgb, var(--vscode-widget-border) 70%, transparent);
  }

  .ribbon-cluster--session {
    flex: 1;
    min-width: 0;
  }

  .ribbon-cluster--meta {
    margin-left: auto;
    justify-content: flex-end;
  }

  .ribbon-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 0.88rem;
    font-family: inherit;
    font-weight: 500;
    border-radius: 4px;
    border: 1px solid
      var(--vscode-button-border, color-mix(in srgb, var(--vscode-foreground) 12%, transparent));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
  }

  .ribbon-btn:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .ribbon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ribbon-btn--accent {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-weight: 600;
  }

  .ribbon-btn--accent:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .ribbon-icon {
    font-size: 0.75em;
    opacity: 0.95;
  }

  .ribbon-label {
    font-size: 0.8rem;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }

  .ribbon-select {
    min-width: 160px;
    max-width: min(360px, 100%);
    padding: 4px 8px;
    border-radius: 3px;
    border: 1px solid var(--vscode-dropdown-border, transparent);
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    font: inherit;
  }

  .ribbon-file {
    font-size: 0.78rem;
    color: var(--vscode-descriptionForeground);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ribbon-hint {
    font-size: 0.78rem;
    color: var(--vscode-descriptionForeground);
  }

  .ribbon-live {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--vscode-charts-green, #3fb950);
  }

  .ribbon-info {
    margin: 0;
    padding: 6px 12px 8px;
    font-size: 0.82rem;
    background: color-mix(
      in srgb,
      var(--vscode-sideBar-background) 90%,
      var(--vscode-editor-background)
    );
    color: var(--vscode-descriptionForeground);
    border-top: 1px solid color-mix(in srgb, var(--vscode-widget-border) 50%, transparent);
  }

  .ribbon-btn--ghost {
    padding: 3px 10px;
    font-size: 0.82rem;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid color-mix(in srgb, var(--vscode-foreground) 22%, transparent);
  }

  .ribbon-btn--ghost:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }

  .intro-banner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    background: color-mix(
      in srgb,
      var(--vscode-textLink-foreground) 10%,
      var(--vscode-editor-background)
    );
    flex-shrink: 0;
    font-size: 0.92em;
    line-height: 1.45;
  }

  .intro-copy {
    flex: 1;
    min-width: 0;
    color: var(--vscode-foreground);
  }

  .intro-copy code {
    font-size: 0.95em;
  }

  .intro-dismiss {
    flex-shrink: 0;
    padding: 4px 10px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    border-radius: 4px;
  }

  .intro-dismiss:hover {
    background: var(--vscode-button-hoverBackground);
  }

  /**
   * Transmit tab: keep overflow here (not only on .lab-panel) — later .lab-panel { overflow: hidden }
   * would otherwise clip a long message list with no scroll.
   */
  .lab-panel.lab-panel--transmit {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .transmit-section-title {
    margin: 0 0 8px;
    flex-shrink: 0;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
  }

  .transmit-dbc-wrap {
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .transmit-dbc-hint {
    margin: 0 4px 16px;
    padding: 12px 14px;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
    border: 1px dashed color-mix(in srgb, var(--vscode-widget-border) 75%, transparent);
    border-radius: 6px;
  }

  .transmit-dbc-hint code {
    font-size: 0.95em;
  }

  .signal-lab-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    flex-shrink: 0;
    font-size: 0.88rem;
    background: color-mix(
      in srgb,
      var(--vscode-inputValidation-errorBackground, #5a1d1d) 35%,
      var(--vscode-editor-background)
    );
    color: var(--vscode-errorForeground, var(--vscode-foreground));
    border-bottom: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-widget-border));
  }

  .ribbon-cluster--virtual {
    padding-right: 10px;
    border-right: 1px solid color-mix(in srgb, var(--vscode-widget-border) 70%, transparent);
  }

  .lab-tabs {
    display: flex;
    gap: 2px;
    padding: 4px 8px 0;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    flex-shrink: 0;
  }

  .lab-tabs button {
    padding: 6px 14px;
    border: none;
    background: transparent;
    color: var(--vscode-tab-inactiveForeground);
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    border-radius: 4px 4px 0 0;
  }

  .lab-tabs button:hover {
    color: var(--vscode-tab-activeForeground);
    background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 80%, transparent);
  }

  .lab-tabs button.active {
    color: var(--vscode-tab-activeForeground);
    border-bottom-color: var(--vscode-focusBorder);
    font-weight: 600;
  }

  .lab-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 10px 12px 12px;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }

  .lab-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tab-placeholder {
    flex: 1;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px 24px;
    gap: 12px;
    border: 1px dashed color-mix(in srgb, var(--vscode-widget-border) 90%, transparent);
    border-radius: 8px;
    background: color-mix(
      in srgb,
      var(--vscode-sideBar-background) 35%,
      var(--vscode-editor-background)
    );
  }

  .tab-placeholder-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .tab-placeholder-body {
    margin: 0;
    max-width: 440px;
    font-size: 0.92em;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
  }
</style>
