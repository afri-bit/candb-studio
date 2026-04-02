<script lang="ts">
  /**
   * Generic data table with sortable columns and row selection.
   * Renders tabular data driven by column definitions.
   */
  import type { Snippet } from 'svelte';

  interface Column {
    key: string;
    label: string;
    width?: string;
  }

  interface Props {
    columns: Column[];
    rows: Record<string, unknown>[];
    selectedIndex?: number | null;
    onSelect?: (index: number, row: Record<string, unknown>) => void;
    emptyText?: string;
    rowActions?: Snippet<[{ row: Record<string, unknown>; index: number }]>;
  }

  let {
    columns,
    rows,
    selectedIndex = null,
    onSelect,
    emptyText = 'No data',
    rowActions,
  }: Props = $props();

  let sortColumn: string | null = $state(null);
  let sortAscending = $state(true);

  function handleSort(key: string) {
    if (sortColumn === key) {
      sortAscending = !sortAscending;
    } else {
      sortColumn = key;
      sortAscending = true;
    }
  }

  let sortedRows = $derived.by(() => {
    if (!sortColumn) return rows;
    const key = sortColumn;
    const dir = sortAscending ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return dir;
      if (bv == null) return -dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  });
</script>

<div class="data-table-wrapper">
  <table class="data-table">
    <thead>
      <tr>
        {#each columns as col}
          <th
            style:width={col.width}
            onclick={() => handleSort(col.key)}
            class:sorted={sortColumn === col.key}
          >
            {col.label}
            {#if sortColumn === col.key}
              <span class="sort-indicator">{sortAscending ? '▲' : '▼'}</span>
            {/if}
          </th>
        {/each}
        {#if rowActions}
          <th style:width="60px"></th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if sortedRows.length === 0}
        <tr class="empty-row">
          <td colspan={columns.length + (rowActions ? 1 : 0)}>{emptyText}</td>
        </tr>
      {:else}
        {#each sortedRows as row, index}
          <tr class:selected={selectedIndex === index} onclick={() => onSelect?.(index, row)}>
            {#each columns as col}
              <td>{row[col.key] ?? ''}</td>
            {/each}
            {#if rowActions}
              <td class="actions">
                {@render rowActions({ row, index })}
              </td>
            {/if}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<style>
  .data-table-wrapper {
    overflow: auto;
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 2px;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--vscode-font-size);
  }

  th {
    text-align: left;
    padding: 4px 8px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-widget-border, #444);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }

  th.sorted {
    color: var(--vscode-focusBorder);
  }

  .sort-indicator {
    margin-left: 4px;
    font-size: 0.7em;
  }

  td {
    padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, #333);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  tr:hover {
    background: var(--vscode-list-hoverBackground);
  }

  tr.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .empty-row td {
    text-align: center;
    padding: 16px;
    color: var(--vscode-descriptionForeground);
  }

  .actions {
    text-align: right;
  }
</style>
