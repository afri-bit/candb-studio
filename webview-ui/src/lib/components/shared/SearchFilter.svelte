<script lang="ts">
  /**
   * Search / filter input with debounced output.
   */

  interface Props {
    placeholder?: string;
    value?: string;
    onFilter?: (text: string) => void;
  }

  let { placeholder = 'Filter…', value = '', onFilter }: Props = $props();

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function handleInput(event: Event) {
    const text = (event.target as HTMLInputElement).value;
    value = text;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onFilter?.(text), 150);
  }

  function handleClear() {
    value = '';
    onFilter?.('');
  }
</script>

<div class="search-filter">
  <span class="icon">&#128269;</span>
  <input type="text" {placeholder} {value} oninput={handleInput} />
  {#if value}
    <button class="clear-btn" onclick={handleClear} title="Clear">×</button>
  {/if}
</div>

<style>
  .search-filter {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
  }

  .search-filter:focus-within {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .icon {
    font-size: 0.85em;
    opacity: 0.6;
  }

  input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    font-family: inherit;
    font-size: inherit;
    outline: none;
    min-width: 0;
  }

  .clear-btn {
    border: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    cursor: pointer;
    padding: 0 2px;
    font-size: 1.1em;
    line-height: 1;
  }

  .clear-btn:hover {
    color: var(--vscode-errorForeground);
  }
</style>
