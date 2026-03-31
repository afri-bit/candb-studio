<script lang="ts">
    /**
     * Named value tables (`VAL_TABLE_` + optional `CM_ VAL_TABLE_`) — referenced by pool signals.
     */
    import { get } from 'svelte/store';
    import type { ValueTableDescriptor } from '../../types';
    import DataTable from '../shared/DataTable.svelte';
    import { vscode } from '../../vscode';
    import { documentUri } from '../../stores/editorContext';

    interface Props {
        valueTables: ValueTableDescriptor[];
    }

    let { valueTables }: Props = $props();

    type EntryRow = { raw: string; label: string };

    let selectedIndex: number | null = $state(null);
    let nameDraft = $state('');
    let commentDraft = $state('');
    /** Editable rows for the selected table (raw integer as text, label). */
    let editEntryRows = $state<EntryRow[]>([{ raw: '', label: '' }]);

    let showCreate = $state(false);
    let createName = $state('');
    let createComment = $state('');
    let createEntryRows = $state<EntryRow[]>([
        { raw: '0', label: 'Off' },
        { raw: '1', label: 'On' },
    ]);

    let selected = $derived(
        selectedIndex !== null ? valueTables[selectedIndex] ?? null : null,
    );

    let rows = $derived(
        valueTables.map((t) => {
            const c = t.comment ?? '';
            return {
                name: t.name,
                comment: c.length > 48 ? `${c.slice(0, 45)}…` : c,
                count: Object.keys(t.entries ?? {}).length,
            };
        }),
    );

    const columns = [
        { key: 'name', label: 'Name', width: '160px' },
        { key: 'comment', label: 'Comment', width: '200px' },
        { key: 'count', label: 'Entries', width: '64px' },
    ];

    function entriesToRows(entries: Record<number, string> | undefined): EntryRow[] {
        const e = entries ?? {};
        const keys = Object.keys(e)
            .map((k) => Number(k))
            .filter((k) => Number.isFinite(k))
            .sort((a, b) => a - b);
        if (keys.length === 0) {
            return [{ raw: '', label: '' }];
        }
        return keys.map((k) => ({ raw: String(k), label: e[k] ?? '' }));
    }

    function rowsToEntries(rows: EntryRow[]): { ok: true; entries: Record<number, string> } | { ok: false; msg: string } {
        const out: Record<number, string> = {};
        for (const r of rows) {
            const rawTrim = r.raw.trim();
            const labelTrim = r.label.trim();
            if (rawTrim === '' && labelTrim === '') {
                continue;
            }
            if (rawTrim === '') {
                return { ok: false, msg: 'Fill in the raw value for each row that has a label, or clear the row.' };
            }
            const n = Number(rawTrim);
            if (!Number.isFinite(n) || !Number.isInteger(n)) {
                return { ok: false, msg: `Raw value must be an integer: "${rawTrim}"` };
            }
            out[n] = labelTrim;
        }
        return { ok: true, entries: out };
    }

    $effect(() => {
        const t = selected;
        if (!t) {
            nameDraft = '';
            commentDraft = '';
            editEntryRows = [{ raw: '', label: '' }];
            return;
        }
        nameDraft = t.name;
        commentDraft = t.comment ?? '';
        editEntryRows = entriesToRows(t.entries);
    });

    function addEditRow() {
        editEntryRows = [...editEntryRows, { raw: '', label: '' }];
    }

    function removeEditRow(index: number) {
        editEntryRows = editEntryRows.filter((_, i) => i !== index);
        if (editEntryRows.length === 0) {
            editEntryRows = [{ raw: '', label: '' }];
        }
    }

    function addCreateRow() {
        createEntryRows = [...createEntryRows, { raw: '', label: '' }];
    }

    function removeCreateRow(index: number) {
        createEntryRows = createEntryRows.filter((_, i) => i !== index);
        if (createEntryRows.length === 0) {
            createEntryRows = [{ raw: '', label: '' }];
        }
    }

    function submitCreate() {
        const name = createName.trim();
        if (!name) {
            window.alert('Enter a table name (identifier).');
            return;
        }
        const parsed = rowsToEntries(createEntryRows);
        if (!parsed.ok) {
            window.alert(parsed.msg);
            return;
        }
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'addValueTable',
            payload: {
                documentUri: uri,
                name,
                comment: createComment.trim() || undefined,
                entries: parsed.entries,
            },
        });
        showCreate = false;
        createName = '';
        createComment = '';
        createEntryRows = [
            { raw: '0', label: 'Off' },
            { raw: '1', label: 'On' },
        ];
        selectedIndex = null;
    }

    function cancelCreate() {
        showCreate = false;
    }

    function removeSelected() {
        if (selectedIndex === null || !selected) return;
        if (!window.confirm(`Remove value table "${selected.name}"? Signals using it will clear the reference.`)) {
            return;
        }
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'removeValueTable',
            payload: { documentUri: uri, name: selected.name },
        });
        selectedIndex = null;
    }

    function applyEntries() {
        if (!selected) return;
        const parsed = rowsToEntries(editEntryRows);
        if (!parsed.ok) {
            window.alert(parsed.msg);
            return;
        }
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'updateValueTable',
            payload: {
                documentUri: uri,
                name: selected.name,
                changes: { entries: parsed.entries },
            },
        });
    }

    function applyRename() {
        if (!selected) return;
        const uri = get(documentUri);
        if (!uri) return;
        const nn = nameDraft.trim();
        if (!nn || nn === selected.name) return;
        vscode.postMessage({
            type: 'updateValueTable',
            payload: {
                documentUri: uri,
                name: selected.name,
                changes: { name: nn },
            },
        });
    }

    function applyComment() {
        if (!selected) return;
        const uri = get(documentUri);
        if (!uri) return;
        vscode.postMessage({
            type: 'updateValueTable',
            payload: {
                documentUri: uri,
                name: selected.name,
                changes: { comment: commentDraft },
            },
        });
    }
</script>

<div class="vt-editor">
    <div class="toolbar">
        <button type="button" class="btn btn-primary" onclick={() => (showCreate = !showCreate)}>
            {showCreate ? 'Close' : 'New value table'}
        </button>
        <button type="button" class="btn danger" onclick={removeSelected} disabled={selected === null}>
            Remove
        </button>
    </div>

    {#if showCreate}
        <div class="create-panel dbc-card">
            <div class="dbc-card-header">Create value table</div>
            <div class="dbc-card-body create-body">
                <label class="field">
                    <span class="lbl">Name <span class="req">*</span></span>
                    <input type="text" class="inp" placeholder="e.g. GearPosition" bind:value={createName} />
                </label>
                <label class="field">
                    <span class="lbl">Comment</span>
                    <textarea class="ta ta-sm" rows="2" placeholder="Shown as CM_ VAL_TABLE_ in DBC" bind:value={createComment}
                    ></textarea>
                </label>
                <div class="field">
                    <span class="lbl">Value descriptions</span>
                    <p class="hint hint-tight">One row per raw value. Integer raw values only (decoded CAN payload).</p>
                    <div class="entries-table-wrap">
                        <table class="entries-table">
                            <thead>
                                <tr>
                                    <th class="col-raw">Raw value</th>
                                    <th class="col-label">Label</th>
                                    <th class="col-act"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each createEntryRows as row, i (i)}
                                    <tr>
                                        <td>
                                            <input
                                                type="text"
                                                class="inp inp-mono"
                                                inputmode="numeric"
                                                placeholder="0"
                                                bind:value={row.raw}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                class="inp"
                                                placeholder="Description"
                                                bind:value={row.label}
                                            />
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                class="btn btn-row"
                                                title="Remove row"
                                                onclick={() => removeCreateRow(i)}
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" class="btn btn-add" onclick={addCreateRow}>Add row</button>
                </div>
                <div class="create-actions">
                    <button type="button" class="btn btn-primary" onclick={submitCreate}>Create</button>
                    <button type="button" class="btn" onclick={cancelCreate}>Cancel</button>
                </div>
            </div>
        </div>
    {/if}

    <div class="editor-split">
        <section class="list-pane" aria-label="Value tables">
            <div class="table-area dbc-card">
                <DataTable
                    {columns}
                    {rows}
                    {selectedIndex}
                    onSelect={(i) => (selectedIndex = i)}
                    emptyText="No value tables — use New value table"
                />
            </div>
        </section>
        <section class="detail-pane" aria-label="Table contents">
            {#if selected}
                <div class="detail-panel dbc-card">
                    <div class="dbc-card-header">Edit table</div>
                    <div class="dbc-card-body">
                        <label class="field">
                            <span class="lbl">Name</span>
                            <input
                                type="text"
                                class="inp"
                                bind:value={nameDraft}
                                onchange={() => applyRename()}
                            />
                        </label>
                        <label class="field">
                            <span class="lbl">Comment</span>
                            <textarea class="ta ta-sm" rows="2" bind:value={commentDraft}></textarea>
                        </label>
                        <button type="button" class="btn btn-primary btn-inline" onclick={() => applyComment()}>
                            Apply comment
                        </button>
                        <div class="field field-gap">
                            <span class="lbl">Value descriptions</span>
                            <p class="hint hint-tight">Integer raw value per row. Empty rows are ignored.</p>
                            <div class="entries-table-wrap">
                                <table class="entries-table">
                                    <thead>
                                        <tr>
                                            <th class="col-raw">Raw value</th>
                                            <th class="col-label">Label</th>
                                            <th class="col-act"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each editEntryRows as row, i (i)}
                                            <tr>
                                                <td>
                                                    <input
                                                        type="text"
                                                        class="inp inp-mono"
                                                        inputmode="numeric"
                                                        placeholder="0"
                                                        bind:value={row.raw}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        class="inp"
                                                        placeholder="Description"
                                                        bind:value={row.label}
                                                    />
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        class="btn btn-row"
                                                        title="Remove row"
                                                        onclick={() => removeEditRow(i)}
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" class="btn btn-add" onclick={addEditRow}>Add row</button>
                        </div>
                        <button type="button" class="btn btn-primary" onclick={() => applyEntries()}>Apply entries</button>
                    </div>
                </div>
            {:else}
                <div class="detail-placeholder">
                    Select a table or create one. Pool signals reference a table by name (Signals tab).
                </div>
            {/if}
        </section>
    </div>
</div>

<style>
    .vt-editor {
        display: flex;
        flex-direction: column;
        gap: 10px;
        height: 100%;
        min-height: 0;
        flex: 1;
    }

    .toolbar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .btn {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        font: inherit;
    }

    .btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        font-weight: 600;
    }

    .btn-primary:hover {
        background: var(--vscode-button-hoverBackground);
    }

    .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .btn.danger {
        color: var(--vscode-errorForeground);
    }

    .btn-inline {
        margin-bottom: 12px;
    }

    .btn-row {
        padding: 4px 8px;
        min-width: 32px;
        line-height: 1;
    }

    .btn-add {
        margin-top: 8px;
    }

    .create-panel {
        flex-shrink: 0;
    }

    .create-body {
        padding-top: 10px;
    }

    .create-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
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
        flex: 0 1 44%;
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
    }

    .detail-panel {
        min-height: 0;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
    }

    .field-gap {
        margin-top: 4px;
    }

    .lbl {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        font-weight: 600;
    }

    .req {
        color: var(--vscode-errorForeground);
    }

    .inp {
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid var(--vscode-input-border, transparent);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        font-family: inherit;
        width: 100%;
        box-sizing: border-box;
    }

    .inp-mono {
        font-family: var(--vscode-editor-font-family, monospace);
    }

    .ta {
        width: 100%;
        box-sizing: border-box;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--vscode-input-border, transparent);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        resize: vertical;
    }

    .ta-sm {
        min-height: 52px;
    }

    .hint {
        margin: 0 0 10px 0;
        font-size: 12px;
        line-height: 1.45;
        color: var(--vscode-descriptionForeground);
    }

    .hint-tight {
        margin-bottom: 6px;
    }

    .entries-table-wrap {
        border: 1px solid var(--dbc-border, var(--vscode-panel-border));
        border-radius: var(--dbc-radius-sm, 6px);
        overflow: auto;
        max-height: min(320px, 45vh);
    }

    .entries-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }

    .entries-table th {
        text-align: left;
        padding: 8px 10px;
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-list-hoverBackground));
        border-bottom: 1px solid var(--dbc-border, var(--vscode-panel-border));
        font-weight: 600;
        position: sticky;
        top: 0;
        z-index: 1;
    }

    .entries-table td {
        padding: 4px 8px;
        border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
        vertical-align: middle;
    }

    .entries-table tr:last-child td {
        border-bottom: none;
    }

    .col-raw {
        width: 110px;
    }

    .col-label {
        min-width: 140px;
    }

    .col-act {
        width: 44px;
        text-align: center;
    }

    .detail-placeholder {
        padding: 20px 16px;
        font-size: 13px;
        color: var(--vscode-descriptionForeground);
        border: 1px dashed color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
        border-radius: var(--dbc-radius, 10px);
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
