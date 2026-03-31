<script lang="ts">
    /**
     * Singleton Signal Lab: live monitor, transmit, charts, and active DBC for decode.
     */
    import { vscode } from './lib/vscode';
    import { databaseStore } from './lib/stores/databaseStore';
    import { documentUri } from './lib/stores/editorContext';
    import { connectionStore } from './lib/stores/connectionStore';
    import { monitorStore } from './lib/stores/monitorStore';
    import { transmitPeriodicStore } from './lib/stores/transmitPeriodicStore';
    import { signalChartStore } from './lib/stores/signalChartStore';
    import MonitorPanel from './lib/components/bus/MonitorPanel.svelte';
    import TransmitPanel from './lib/components/bus/TransmitPanel.svelte';
    import SignalChartPanel from './lib/components/bus/SignalChartPanel.svelte';
    import type { WebviewInboundMessage } from './lib/types';

    const INTRO_STORAGE_KEY = 'vscode-canbus.signalLab.introDismissed';

    type Tab = 'monitor' | 'transmit' | 'charts';

    let activeTab: Tab = $state('monitor');
    let sessionUris = $state<string[]>([]);
    let activeBusUri = $state<string | null>(null);
    let showIntro = $state(false);

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

    /** Human-readable path for `file://` URIs; falls back to the raw string. */
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

    function openDatabase() {
        vscode.postMessage({ type: 'signalLab.openDatabase' });
    }

    $effect(() => {
        showIntro = !readIntroDismissed();
    });

    /** Charts tab: pause ring-buffer ingest so high-rate traffic does not cost CPU when not visible. */
    $effect(() => {
        signalChartStore.setIngestPaused(activeTab !== 'charts');
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
                    break;
                case 'monitor.frame':
                    monitorStore.addFrame(message.frame);
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
    {#if showIntro}
        <div class="intro-banner" role="status">
            <div class="intro-copy">
                <strong>Welcome to Signal Lab.</strong>
                Use this panel for live CAN traffic and transmit. Edit your database in the
                <strong>CAN Database Editor</strong> (open a <code>.dbc</code> file). Pick which loaded file decodes the bus
                below, then connect hardware from the status bar or Command Palette.
            </div>
            <button type="button" class="intro-dismiss" onclick={dismissIntro}>Got it</button>
        </div>
    {/if}

    <header class="lab-header">
        <div class="lab-header-row">
            <h1 class="lab-title">CAN Signal Lab</h1>
            <span class="lab-subtitle">Instrumentation</span>
        </div>
        <p class="lab-help">
            Choose the <strong>active database for the bus</strong> — it drives decode in Monitor and the message list in Transmit.
        </p>

        <div class="lab-session">
            <label class="lab-label" for="dbc-session">Active database for decode</label>
            <select
                id="dbc-session"
                class="lab-select"
                value={activeBusUri ?? ''}
                onchange={onSessionChange}
                disabled={sessionUris.length === 0}
                title={activeBusUri ? displayPath(activeBusUri) : 'Select a loaded CAN database'}
            >
                {#if sessionUris.length === 0}
                    <option value="">No CAN database in memory</option>
                {:else}
                    {#if activeBusUri === null}
                        <option value="">Choose a database…</option>
                    {/if}
                    {#each sessionUris as u (u)}
                        <option value={u} title={displayPath(u)}>{shortName(u)}</option>
                    {/each}
                {/if}
            </select>
            <button type="button" class="lab-btn" onclick={openDatabase}>Open CAN database…</button>
        </div>

        {#if sessionUris.length > 0 && activeBusUri}
            <p class="active-path" title={displayPath(activeBusUri)}>
                <span class="active-path-label">Active file</span>
                <code class="active-path-value">{displayPath(activeBusUri)}</code>
            </p>
        {:else if sessionUris.length > 0 && activeBusUri === null}
            <p class="warn-strip" role="alert">
                Select which loaded database decodes traffic on the bus before relying on Monitor or Transmit.
            </p>
        {/if}
    </header>

    {#if sessionUris.length > 0}
        <nav class="lab-tabs">
            <button type="button" class:active={activeTab === 'monitor'} onclick={() => (activeTab = 'monitor')}>Monitor</button>
            <button type="button" class:active={activeTab === 'transmit'} onclick={() => (activeTab = 'transmit')}>Transmit</button>
            <button type="button" class:active={activeTab === 'charts'} onclick={() => (activeTab = 'charts')}>Charts</button>
        </nav>
    {/if}

    <div class="lab-body">
        {#if sessionUris.length === 0}
            <div class="empty-hero" role="region" aria-label="No database loaded">
                <p class="empty-title">No CAN database loaded</p>
                <p class="empty-body">
                    Open a <code>.dbc</code> from the Explorer or use <strong>Open CAN database…</strong>. The schema in memory powers
                    decoding and transmit. Editing definitions stays in the <strong>CAN Database Editor</strong>.
                </p>
                <button type="button" class="lab-btn-primary" onclick={openDatabase}>Open CAN database…</button>
                <p class="empty-hint">Tip: after loading, pick it above as the active database for decode.</p>
            </div>
        {:else if activeTab === 'monitor'}
            <div class="lab-panel">
                <MonitorPanel messages={$databaseStore.messages} />
            </div>
        {:else if activeTab === 'transmit'}
            <div class="lab-panel">
                <TransmitPanel messages={$databaseStore.messages} />
            </div>
        {:else}
            <div class="lab-panel charts-panel">
                <SignalChartPanel messages={$databaseStore.messages} />
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

    .lab-header {
        padding: 10px 14px;
        border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
        background: var(--vscode-editorGroupHeader-tabsBackground);
        flex-shrink: 0;
    }

    .intro-banner {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
        background: color-mix(in srgb, var(--vscode-textLink-foreground) 12%, var(--vscode-editor-background));
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

    .lab-header-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 6px;
    }

    .lab-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
    }

    .lab-subtitle {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--vscode-descriptionForeground);
    }

    .lab-help {
        margin: 0 0 10px 0;
        font-size: 0.88em;
        color: var(--vscode-descriptionForeground);
        line-height: 1.4;
    }

    .active-path {
        margin: 8px 0 0 0;
        font-size: 0.82em;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
    }

    .active-path-label {
        color: var(--vscode-descriptionForeground);
    }

    .active-path-value {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.95em;
        word-break: break-all;
        color: var(--vscode-foreground);
    }

    .warn-strip {
        margin: 8px 0 0 0;
        padding: 8px 10px;
        border-radius: 4px;
        font-size: 0.88em;
        background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground) 65%, transparent);
        color: var(--vscode-foreground);
    }

    .lab-session {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    .lab-label {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
    }

    .lab-select {
        min-width: 200px;
        max-width: min(480px, 100%);
        padding: 4px 8px;
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border, transparent);
        font-family: inherit;
        font-size: inherit;
    }

    .lab-btn {
        padding: 4px 12px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
        border-radius: 4px;
    }

    .lab-btn:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .lab-btn-primary {
        padding: 8px 16px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
        border-radius: 6px;
        font-weight: 600;
    }

    .lab-btn-primary:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .empty-hero {
        flex: 1;
        min-height: 200px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 32px 24px;
        gap: 12px;
        border: 1px dashed color-mix(in srgb, var(--vscode-foreground) 22%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background));
    }

    .empty-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
    }

    .empty-body {
        margin: 0;
        max-width: 520px;
        font-size: 0.92em;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground);
    }

    .empty-body code {
        font-size: 0.95em;
    }

    .empty-hint {
        margin: 0;
        font-size: 0.82em;
        color: var(--vscode-descriptionForeground);
    }

    .lab-tabs {
        display: flex;
        gap: 2px;
        padding: 6px 12px 0;
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
        padding: 12px;
        overflow: hidden;
    }

    .lab-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
</style>
