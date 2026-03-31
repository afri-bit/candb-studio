<script lang="ts">
    /**
     * Attribute definition list and editor (BA_DEF_-style): Definition + Comment tabs.
     */
    import { tick } from 'svelte';
    import { get } from 'svelte/store';
    import type { AttributeDescriptor } from '../../types';
    import DataTable from '../shared/DataTable.svelte';
    import { vscode } from '../../vscode';
    import { documentUri } from '../../stores/editorContext';

    interface Props {
        attributes: AttributeDescriptor[];
        focusAttributeIndex?: number | null;
        onFocusConsumed?: () => void;
    }

    let { attributes, focusAttributeIndex = null, onFocusConsumed }: Props = $props();

    let selectedIndex: number | null = $state(null);
    let attrTab = $state<'definition' | 'comment'>('definition');
    let helpOpen = $state(false);
    /** After Add, select the new row when the database update arrives. */
    let pendingSelectNew = $state(false);
    let lastAttributeCount = $state(0);
    let addPendingClearTimeout: number | undefined;

    /** BA_DEF_ object scope: only messages and nodes (not signals) in this editor. */
    const OBJECT_TYPES_SUPPORTED = ['Message', 'Node'] as const;

    function objectTypeOptionsFor(current: string): string[] {
        if ((OBJECT_TYPES_SUPPORTED as readonly string[]).includes(current)) {
            return [...OBJECT_TYPES_SUPPORTED];
        }
        return [current, ...OBJECT_TYPES_SUPPORTED];
    }

    function objectTypeOptionLabel(o: string): string {
        if ((OBJECT_TYPES_SUPPORTED as readonly string[]).includes(o)) return o;
        return `${o} (from file — switch to Message or Node)`;
    }

    const VALUE_OPTIONS: { value: string; label: string }[] = [
        { value: 'INT', label: 'Integer' },
        { value: 'FLOAT', label: 'Float' },
        { value: 'STRING', label: 'String' },
        { value: 'ENUM', label: 'Enum' },
        { value: 'HEX', label: 'Hex' },
    ];

    const columns = [
        { key: 'name', label: 'Attribute', width: '160px' },
        { key: 'objectType', label: 'Object Type', width: '120px' },
        { key: 'valueType', label: 'Value Type', width: '100px' },
        { key: 'defaultValue', label: 'Default', width: '100px' },
    ];

    let rows = $derived(
        attributes.map((a) => ({
            name: a.name,
            objectType: a.objectType,
            valueType: a.valueType,
            defaultValue: a.defaultValue ?? '',
        })),
    );

    let selectedAttr = $derived(
        selectedIndex !== null ? attributes[selectedIndex] ?? null : null,
    );

    function formatDefaultForInput(a: AttributeDescriptor): string {
        const v = a.defaultValue;
        if (v === undefined || v === null) return '';
        return String(v);
    }

    function onPropertyChange(key: string, value: string | number | boolean) {
        if (selectedIndex === null) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'updateAttribute',
            payload: {
                documentUri: uri,
                index: selectedIndex,
                changes: { [key]: value },
            },
        });
    }

    function onDefaultInput(raw: string) {
        if (!selectedAttr) return;
        const vt = selectedAttr.valueType;
        if (vt === 'INT' || vt === 'HEX') {
            const n = parseInt(raw, 10);
            onPropertyChange('defaultValue', Number.isNaN(n) ? 0 : n);
            return;
        }
        if (vt === 'FLOAT') {
            const n = parseFloat(raw);
            onPropertyChange('defaultValue', Number.isNaN(n) ? 0 : n);
            return;
        }
        onPropertyChange('defaultValue', raw);
    }

    function saveFile() {
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({ type: 'saveDocument', documentUri: uri });
    }

    function cancelSelection() {
        selectedIndex = null;
        attrTab = 'definition';
    }

    function addAttributeDefinition() {
        const uri = get(documentUri);
        if (!uri) return;
        if (addPendingClearTimeout !== undefined) {
            clearTimeout(addPendingClearTimeout);
        }
        pendingSelectNew = true;
        vscode.postMessage({ type: 'addAttributeDefinition', payload: { documentUri: uri } });
        addPendingClearTimeout = window.setTimeout(() => {
            pendingSelectNew = false;
            addPendingClearTimeout = undefined;
        }, 4000);
    }

    $effect(() => {
        const idx = focusAttributeIndex;
        if (idx === null || idx === undefined) return;
        void (async () => {
            await tick();
            selectedIndex = idx >= 0 && idx < attributes.length ? idx : null;
            attrTab = 'definition';
            onFocusConsumed?.();
        })();
    });

    $effect(() => {
        selectedIndex;
        attrTab = 'definition';
    });

    $effect(() => {
        const len = attributes.length;
        if (pendingSelectNew && len > lastAttributeCount) {
            selectedIndex = len - 1;
            attrTab = 'definition';
            pendingSelectNew = false;
            if (addPendingClearTimeout !== undefined) {
                clearTimeout(addPendingClearTimeout);
                addPendingClearTimeout = undefined;
            }
        }
        lastAttributeCount = len;
    });
</script>

<div class="attribute-editor">
    <div class="attr-toolbar">
        <button type="button" class="btn-add" onclick={addAttributeDefinition}>Add attribute</button>
    </div>
    <div class="editor-split">
        <section class="list-pane" aria-label="Attribute list">
            <div class="table-area dbc-card">
                <DataTable
                    {columns}
                    {rows}
                    {selectedIndex}
                    onSelect={(i) => (selectedIndex = i)}
                    emptyText="No attributes defined"
                />
            </div>
        </section>
        <section class="detail-pane" aria-label="Attribute properties">
            {#if selectedAttr}
                <div class="detail-panel dbc-card">
                    <div class="dbc-card-header detail-head">
                        <span>Attribute definition — {selectedAttr.name}</span>
                        <span class="dbc-subtle">BA_DEF_</span>
                    </div>

                    <div class="attr-tabs" role="tablist" aria-label="Attribute sections">
                        <button
                            type="button"
                            role="tab"
                            class:active={attrTab === 'definition'}
                            aria-selected={attrTab === 'definition'}
                            onclick={() => (attrTab = 'definition')}
                        >
                            Definition
                        </button>
                        <button
                            type="button"
                            role="tab"
                            class:active={attrTab === 'comment'}
                            aria-selected={attrTab === 'comment'}
                            onclick={() => (attrTab = 'comment')}
                        >
                            Comment
                        </button>
                    </div>

                    <div class="dbc-card-body attr-tab-body">
                        {#if attrTab === 'definition'}
                            <div class="form-grid">
                                <label class="field-label" for="attr-name">Name</label>
                                <input
                                    id="attr-name"
                                    class="field-input"
                                    type="text"
                                    value={selectedAttr.name}
                                    onchange={(e) =>
                                        onPropertyChange('name', (e.currentTarget as HTMLInputElement).value)}
                                />

                                <label class="field-label" for="attr-obj">Object Type</label>
                                <select
                                    id="attr-obj"
                                    class="field-input"
                                    value={selectedAttr.objectType}
                                    onchange={(e) =>
                                        onPropertyChange('objectType', (e.currentTarget as HTMLSelectElement).value)}
                                >
                                    {#each objectTypeOptionsFor(selectedAttr.objectType) as o}
                                        <option value={o}>{objectTypeOptionLabel(o)}</option>
                                    {/each}
                                </select>

                                <label class="field-label" for="attr-vt">Value Type</label>
                                <select
                                    id="attr-vt"
                                    class="field-input"
                                    value={selectedAttr.valueType}
                                    onchange={(e) =>
                                        onPropertyChange('valueType', (e.currentTarget as HTMLSelectElement).value)}
                                >
                                    {#each VALUE_OPTIONS as o}
                                        <option value={o.value}>{o.label}</option>
                                    {/each}
                                </select>

                                <label class="field-label" for="attr-def">Default</label>
                                <input
                                    id="attr-def"
                                    class="field-input"
                                    type="text"
                                    value={formatDefaultForInput(selectedAttr)}
                                    onchange={(e) => onDefaultInput((e.currentTarget as HTMLInputElement).value)}
                                />

                                <label class="field-label" for="attr-min">Minimum</label>
                                <input
                                    id="attr-min"
                                    class="field-input"
                                    type="number"
                                    value={selectedAttr.minimum ?? 0}
                                    onchange={(e) =>
                                        onPropertyChange(
                                            'minimum',
                                            Number((e.currentTarget as HTMLInputElement).value),
                                        )}
                                />

                                <label class="field-label" for="attr-max">Maximum</label>
                                <input
                                    id="attr-max"
                                    class="field-input"
                                    type="number"
                                    value={selectedAttr.maximum ?? 0}
                                    onchange={(e) =>
                                        onPropertyChange(
                                            'maximum',
                                            Number((e.currentTarget as HTMLInputElement).value),
                                        )}
                                />
                            </div>
                        {:else}
                            <label class="sr-only" for="attr-comment">Comment</label>
                            <textarea
                                id="attr-comment"
                                class="comment-area"
                                rows={12}
                                value={selectedAttr.comment ?? ''}
                                placeholder="Documentation for this attribute definition…"
                                onchange={(e) =>
                                    onPropertyChange('comment', (e.currentTarget as HTMLTextAreaElement).value)}
                            ></textarea>
                        {/if}
                    </div>

                    <div class="dialog-actions">
                        <button
                            type="button"
                            class="btn btn-primary"
                            onclick={saveFile}
                            title="Writes the database (including BA_DEF_ lines) to the document and saves the file"
                        >
                            OK
                        </button>
                        <button type="button" class="btn" onclick={cancelSelection}>Cancel</button>
                        <button type="button" class="btn" disabled title="Edits apply as you change fields">
                            Apply
                        </button>
                        <button
                            type="button"
                            class="btn"
                            onclick={() => (helpOpen = !helpOpen)}
                            aria-expanded={helpOpen}
                        >
                            Help
                        </button>
                    </div>
                    {#if helpOpen}
                        <div class="help-box" role="note">
                            <strong>Attribute definitions (BA_DEF_)</strong> here apply to <strong>messages</strong> and
                            <strong>nodes</strong> only (not signals). Value type sets how defaults and limits are
                            interpreted. Use <strong>OK</strong> to save the .dbc file; <strong>Cancel</strong> clears the
                            selection in this panel. If the file had another target (e.g. Signal), pick Message or Node
                            to align with this model.
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="detail-placeholder">Select an attribute in the list to edit its definition.</div>
            {/if}
        </section>
    </div>
</div>

<style>
    .attribute-editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        min-height: 0;
        flex: 1;
    }

    .attr-toolbar {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .btn-add {
        padding: 5px 12px;
        font-size: 12px;
        font-family: inherit;
        font-weight: 600;
        cursor: pointer;
        border-radius: 6px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }

    .btn-add:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .editor-split {
        display: flex;
        flex-direction: row;
        flex: 1;
        min-height: 0;
        gap: 12px;
        align-items: stretch;
    }

    .list-pane {
        flex: 0 1 42%;
        max-width: 520px;
        min-width: 200px;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .table-area {
        flex: 1;
        min-height: 0;
        overflow: auto;
    }

    .detail-pane {
        flex: 1;
        min-width: 260px;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
    }

    .detail-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .detail-head {
        flex-wrap: wrap;
        gap: 8px;
    }

    .attr-tabs {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px 0;
        border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, transparent);
    }

    .attr-tabs button {
        padding: 6px 12px;
        border: none;
        background: transparent;
        color: var(--vscode-tab-inactiveForeground);
        font-family: inherit;
        font-size: 12px;
        cursor: pointer;
        border-radius: 6px 6px 0 0;
        border-bottom: 2px solid transparent;
    }

    .attr-tabs button:hover {
        color: var(--vscode-tab-activeForeground);
        background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
    }

    .attr-tabs button.active {
        color: var(--vscode-tab-activeForeground);
        border-bottom-color: var(--vscode-focusBorder);
        font-weight: 600;
    }

    .attr-tab-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .form-grid {
        display: grid;
        grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
        gap: 10px 16px;
        align-items: center;
        max-width: 520px;
    }

    .field-label {
        margin: 0;
        font-size: 12px;
        text-align: right;
        color: var(--vscode-descriptionForeground);
        justify-self: end;
    }

    .field-input {
        width: 100%;
        max-width: 320px;
        box-sizing: border-box;
        padding: 5px 8px;
        font-size: 13px;
        font-family: var(--vscode-editor-font-family, inherit);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 4px;
    }

    .field-input:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }

    .comment-area {
        width: 100%;
        min-height: 180px;
        box-sizing: border-box;
        padding: 8px 10px;
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        line-height: 1.45;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 6px;
        resize: vertical;
    }

    .dialog-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 12px 10px;
        border-top: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
        flex-shrink: 0;
    }

    .btn {
        padding: 5px 14px;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        border-radius: 4px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }

    .btn:hover:not(:disabled) {
        background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-weight: 600;
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
    }

    .help-box {
        margin: 0 12px 12px;
        padding: 10px 12px;
        font-size: 11px;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground);
        border-radius: 6px;
        border: 1px solid var(--vscode-widget-border, #444);
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-textBlockQuote-background));
    }

    .detail-placeholder {
        padding: 20px 16px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground);
        border: 1px dashed color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
        border-radius: var(--dbc-radius, 10px);
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-list-hoverBackground));
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    @media (max-width: 720px) {
        .editor-split {
            flex-direction: column;
        }

        .list-pane {
            max-width: none;
            max-height: 40vh;
        }

        .form-grid {
            grid-template-columns: 1fr;
        }

        .field-label {
            text-align: left;
            justify-self: start;
        }
    }
</style>
