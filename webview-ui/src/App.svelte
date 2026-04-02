<script lang="ts">
  import { get } from 'svelte/store';
  import { vscode } from './lib/vscode';
  import { databaseStore } from './lib/stores/databaseStore';
  import { documentUri } from './lib/stores/editorContext';
  import MessageEditor from './lib/components/database/MessageEditor.svelte';
  import SignalEditor from './lib/components/database/SignalEditor.svelte';
  import NodeEditor from './lib/components/database/NodeEditor.svelte';
  import AttributeEditor from './lib/components/database/AttributeEditor.svelte';
  import ValueTablesEditor from './lib/components/database/ValueTablesEditor.svelte';
  import ArchitectureView from './lib/components/database/ArchitectureView.svelte';
  import DatabaseExplorer from './lib/components/database/DatabaseExplorer.svelte';
  import type { WebviewInboundMessage } from './lib/types';

  type Tab = 'messages' | 'signals' | 'nodes' | 'attributes' | 'valueTables' | 'architecture';

  const SIDEBAR_MIN = 180;
  const SIDEBAR_DEFAULT = 264;

  function clampSidebarWidth(w: number): number {
    if (typeof window === 'undefined') return Math.max(SIDEBAR_MIN, w);
    const max = Math.max(SIDEBAR_MIN, Math.floor(window.innerWidth * 0.55));
    return Math.min(max, Math.max(SIDEBAR_MIN, Math.round(w)));
  }

  function readStoredSidebarWidth(): number {
    try {
      const v = localStorage.getItem('candb-studio.sidebarWidth');
      if (v) {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) return clampSidebarWidth(n);
      }
    } catch {
      /* ignore */
    }
    return SIDEBAR_DEFAULT;
  }

  let sidebarWidthPx = $state(readStoredSidebarWidth());

  function persistSidebarWidth() {
    try {
      localStorage.setItem('candb-studio.sidebarWidth', String(sidebarWidthPx));
    } catch {
      /* ignore */
    }
  }

  function onSidebarResizePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthPx;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent) {
      sidebarWidthPx = clampSidebarWidth(startW + (ev.clientX - startX));
    }

    function onUp(ev: PointerEvent) {
      target.releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      persistSidebarWidth();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  $effect(() => {
    function onWinResize() {
      sidebarWidthPx = clampSidebarWidth(sidebarWidthPx);
    }
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  });

  let activeTab: Tab = $state('messages');
  let selectedMessageId: number | null = $state(null);
  let savePulse = $state(false);
  /** Programmatic focus for Signals tab (from bit layout / explorer). */
  let signalFocus: { messageId?: number; signalName: string } | null = $state(null);
  let nodeFocus: string | null = $state(null);
  let attributeFocusIndex: number | null = $state(null);

  function saveActiveDocument() {
    const uri = get(documentUri);
    if (!uri) return;
    savePulse = true;
    window.setTimeout(() => {
      savePulse = false;
    }, 600);
    vscode.postMessage({ type: 'saveDocument', documentUri: uri });
  }

  function openTextEditorView() {
    const uri = get(documentUri);
    if (!uri) return;
    vscode.postMessage({ type: 'openTextEditorView', documentUri: uri });
  }

  function navigateToSignalsForSelectedMessage() {
    if (selectedMessageId === null) return;
    activeTab = 'signals';
    signalFocus = { messageId: selectedMessageId, signalName: '' };
  }

  function handleExplorerSelectMessage(id: number) {
    selectedMessageId = id;
    activeTab = 'messages';
  }

  function handleExplorerSelectSignal(signalName: string) {
    activeTab = 'signals';
    signalFocus = { signalName: signalName };
  }

  function handleExplorerSelectNode(nodeName: string) {
    nodeFocus = nodeName;
    activeTab = 'nodes';
  }

  function handleExplorerSelectAttribute(index: number) {
    attributeFocusIndex = index;
    activeTab = 'attributes';
  }

  function handleAttributeFocusConsumed() {
    attributeFocusIndex = null;
  }

  function handleNavigateToSignalFromBitLayout(messageId: number, signalName: string) {
    activeTab = 'signals';
    signalFocus = { messageId, signalName };
  }

  function handleFocusSignalConsumed() {
    signalFocus = null;
  }

  function handleFocusNodeConsumed() {
    nodeFocus = null;
  }

  $effect(() => {
    const handler = (event: MessageEvent<WebviewInboundMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'database.update':
          documentUri.set(message.documentUri);
          databaseStore.setDatabase(message.database);
          break;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'database.ready' });

    return () => window.removeEventListener('message', handler);
  });
</script>

<div class="dbc-shell">
  <aside class="dbc-sidebar" style:width="{sidebarWidthPx}px">
    <DatabaseExplorer
      version={$databaseStore.version}
      messages={$databaseStore.messages}
      signalPool={$databaseStore.signalPool}
      nodes={$databaseStore.nodes}
      attributes={$databaseStore.attributes}
      environmentVariables={$databaseStore.environmentVariables}
      {selectedMessageId}
      onSelectMessage={handleExplorerSelectMessage}
      onSelectSignal={handleExplorerSelectSignal}
      onSelectNode={handleExplorerSelectNode}
      onSelectAttribute={handleExplorerSelectAttribute}
    />
  </aside>

  <button
    type="button"
    class="sidebar-resizer"
    aria-label="Resize sidebar"
    title="Drag to resize sidebar"
    onpointerdown={onSidebarResizePointerDown}
    onkeydown={(e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        sidebarWidthPx = clampSidebarWidth(sidebarWidthPx - 12);
        persistSidebarWidth();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        sidebarWidthPx = clampSidebarWidth(sidebarWidthPx + 12);
        persistSidebarWidth();
      }
    }}
  ></button>

  <div class="dbc-main">
    <nav class="tab-bar">
      <button class:active={activeTab === 'messages'} onclick={() => (activeTab = 'messages')}
        >Messages</button
      >
      <button class:active={activeTab === 'signals'} onclick={() => (activeTab = 'signals')}
        >Signals</button
      >
      <button class:active={activeTab === 'nodes'} onclick={() => (activeTab = 'nodes')}
        >Nodes</button
      >
      <button class:active={activeTab === 'attributes'} onclick={() => (activeTab = 'attributes')}
        >Attributes</button
      >
      <button class:active={activeTab === 'valueTables'} onclick={() => (activeTab = 'valueTables')}
        >Value tables</button
      >
      <button
        class:active={activeTab === 'architecture'}
        onclick={() => (activeTab = 'architecture')}>Architecture</button
      >
      <span class="spacer"></span>
      <button
        class="text-view-btn"
        type="button"
        title="Open this file as plain text in the default editor"
        onclick={openTextEditorView}
      >
        Text view
      </button>
      <button
        class="save-btn"
        class:pulse={savePulse}
        type="button"
        title="Save (writes the .dbc file)"
        onclick={saveActiveDocument}
      >
        Save
      </button>
    </nav>

    <div class="tab-content">
      {#if activeTab === 'messages'}
        <div class="dbc-card main-card editor-tab-card">
          <div class="dbc-card-header">
            <span>Messages</span>
          </div>
          <div class="dbc-card-body dbc-card-body-fill">
            <MessageEditor
              messages={$databaseStore.messages}
              nodes={$databaseStore.nodes}
              signalPool={$databaseStore.signalPool}
              bind:selectedMessageId
              onGotoNode={(name) => {
                nodeFocus = name;
                activeTab = 'nodes';
              }}
              onNavigateToSignals={navigateToSignalsForSelectedMessage}
              onNavigateToSignal={handleNavigateToSignalFromBitLayout}
            />
          </div>
        </div>
      {:else if activeTab === 'signals'}
        <div class="dbc-card main-card editor-tab-card">
          <div class="dbc-card-header">
            <span>Signals</span>
          </div>
          <div class="dbc-card-body dbc-card-body-fill">
            <SignalEditor
              signalPool={$databaseStore.signalPool}
              valueTables={$databaseStore.valueTables}
              messages={$databaseStore.messages}
              focusSignal={signalFocus}
              onFocusConsumed={handleFocusSignalConsumed}
              onOpenMessage={(id) => {
                selectedMessageId = id;
                activeTab = 'messages';
              }}
            />
          </div>
        </div>
      {:else if activeTab === 'nodes'}
        <div class="dbc-card main-card editor-tab-card">
          <div class="dbc-card-header">
            <span>Network nodes</span>
          </div>
          <div class="dbc-card-body dbc-card-body-fill">
            <NodeEditor
              nodes={$databaseStore.nodes}
              messages={$databaseStore.messages}
              version={$databaseStore.version}
              focusNodeName={nodeFocus}
              onFocusConsumed={handleFocusNodeConsumed}
              onGotoMessage={(id) => {
                selectedMessageId = id;
                activeTab = 'messages';
              }}
            />
          </div>
        </div>
      {:else if activeTab === 'attributes'}
        <div class="dbc-card main-card editor-tab-card">
          <div class="dbc-card-header">
            <span>Attribute definitions</span>
          </div>
          <div class="dbc-card-body dbc-card-body-fill">
            <AttributeEditor
              attributes={$databaseStore.attributes}
              focusAttributeIndex={attributeFocusIndex}
              onFocusConsumed={handleAttributeFocusConsumed}
            />
          </div>
        </div>
      {:else if activeTab === 'valueTables'}
        <div class="dbc-card main-card editor-tab-card">
          <div class="dbc-card-header">
            <span>Value tables</span>
          </div>
          <div class="dbc-card-body dbc-card-body-fill">
            <ValueTablesEditor valueTables={$databaseStore.valueTables} />
          </div>
        </div>
      {:else if activeTab === 'architecture'}
        <div class="dbc-card main-card editor-tab-card">
          <div class="dbc-card-header">
            <span>Architecture</span>
          </div>
          <div class="dbc-card-body dbc-card-body-fill arch-tab-body">
            <ArchitectureView
              nodes={$databaseStore.nodes}
              messages={$databaseStore.messages}
              signalPool={$databaseStore.signalPool}
              version={$databaseStore.version}
              onSelectMessage={(id) => {
                selectedMessageId = id;
                activeTab = 'messages';
              }}
              onSelectNode={(name) => {
                nodeFocus = name;
                activeTab = 'nodes';
              }}
              onNavigateToSignal={handleNavigateToSignalFromBitLayout}
            />
          </div>
        </div>
      {/if}
    </div>
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

  .tab-bar {
    display: flex;
    gap: 2px;
    padding: 6px 12px;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    flex-shrink: 0;
    align-items: center;
  }

  .tab-bar button {
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

  .tab-bar button:hover {
    color: var(--vscode-tab-activeForeground);
    background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 80%, transparent);
  }

  .tab-bar button.active {
    color: var(--vscode-tab-activeForeground);
    border-bottom-color: var(--vscode-focusBorder);
    font-weight: 600;
  }

  .text-view-btn {
    font-weight: 500;
    border: 1px solid color-mix(in srgb, var(--vscode-foreground) 14%, transparent) !important;
    background: color-mix(
      in srgb,
      var(--vscode-toolbar-hoverBackground) 55%,
      transparent
    ) !important;
    color: var(--vscode-foreground) !important;
    border-radius: 6px;
  }

  .text-view-btn:hover {
    background: color-mix(
      in srgb,
      var(--vscode-toolbar-hoverBackground) 85%,
      transparent
    ) !important;
  }

  .save-btn {
    font-weight: 600;
    border: 1px solid var(--vscode-button-border, transparent) !important;
    background: var(--vscode-button-secondaryBackground) !important;
    color: var(--vscode-button-secondaryForeground) !important;
    border-radius: 6px;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      filter 0.18s ease;
  }

  .save-btn:hover {
    filter: brightness(1.06);
  }

  .save-btn.pulse {
    animation: save-flash 0.55s ease;
  }

  @keyframes save-flash {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--vscode-button-background) 55%, transparent);
    }
    40% {
      transform: scale(1.04);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--vscode-focusBorder) 45%, transparent);
      filter: brightness(1.12);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 transparent;
    }
  }

  .spacer {
    flex: 1;
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 12px;
  }

  .main-card {
    width: 100%;
    min-width: 0;
    align-self: stretch;
  }

  .main-card.editor-tab-card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global(.dbc-card-body-fill) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sidebar-resizer {
    flex-shrink: 0;
    width: 6px;
    margin: 0;
    padding: 0;
    border: none;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 2;
    align-self: stretch;
  }

  .sidebar-resizer:hover,
  .sidebar-resizer:focus-visible {
    background: color-mix(in srgb, var(--vscode-focusBorder) 35%, transparent);
  }

  .sidebar-resizer:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
</style>
