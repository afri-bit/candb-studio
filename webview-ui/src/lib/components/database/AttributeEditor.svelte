<script lang="ts">
    /**
     * Attribute definition list and editor.
     */
    import { tick } from 'svelte';
    import { get } from 'svelte/store';
    import type { AttributeDescriptor } from '../../types';
    import DataTable from '../shared/DataTable.svelte';
    import PropertyGrid from '../shared/PropertyGrid.svelte';
    import { vscode } from '../../vscode';
    import { documentUri } from '../../stores/editorContext';

    interface Props {
        attributes: AttributeDescriptor[];
        focusAttributeIndex?: number | null;
        onFocusConsumed?: () => void;
    }

    let { attributes, focusAttributeIndex = null, onFocusConsumed }: Props = $props();

    let selectedIndex: number | null = $state(null);

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

    let detailProps = $derived(
        selectedAttr
            ? [
                  { key: 'name', label: 'Name', value: selectedAttr.name, type: 'text' as const },
                  {
                      key: 'objectType',
                      label: 'Object Type',
                      value: selectedAttr.objectType,
                      type: 'select' as const,
                      options: ['Network', 'Node', 'Message', 'Signal', 'Environment'],
                  },
                  {
                      key: 'valueType',
                      label: 'Value Type',
                      value: selectedAttr.valueType,
                      type: 'select' as const,
                      options: ['INT', 'FLOAT', 'STRING', 'ENUM', 'HEX'],
                  },
                  { key: 'minimum', label: 'Minimum', value: selectedAttr.minimum ?? 0, type: 'number' as const },
                  { key: 'maximum', label: 'Maximum', value: selectedAttr.maximum ?? 0, type: 'number' as const },
                  { key: 'defaultValue', label: 'Default', value: selectedAttr.defaultValue ?? '', type: 'text' as const },
                  { key: 'comment', label: 'Comment', value: selectedAttr.comment, type: 'text' as const },
              ]
            : [],
    );

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

    $effect(() => {
        const idx = focusAttributeIndex;
        if (idx === null || idx === undefined) return;
        void (async () => {
            await tick();
            selectedIndex = idx >= 0 && idx < attributes.length ? idx : null;
            onFocusConsumed?.();
        })();
    });
</script>

<div class="attribute-editor">
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
                    <div class="dbc-card-header">
                        <span>{selectedAttr.name}</span>
                        <span class="dbc-subtle">BA_DEF</span>
                    </div>
                    <div class="dbc-card-body">
                        <PropertyGrid properties={detailProps} onChange={onPropertyChange} />
                    </div>
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

    @media (max-width: 720px) {
        .editor-split {
            flex-direction: column;
        }

        .list-pane {
            max-width: none;
            max-height: 40vh;
        }
    }
</style>
