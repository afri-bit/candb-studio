<script lang="ts">
  /**
   * Key-value property editor displayed as a two-column grid.
   * Used by detail panels (e.g. signal properties, message metadata).
   */

  interface Property {
    key: string;
    label: string;
    value: string | number | boolean;
    type?: 'text' | 'number' | 'boolean' | 'select';
    options?: string[];
    readonly?: boolean;
  }

  interface Props {
    properties: Property[];
    onChange?: (key: string, value: string | number | boolean) => void;
  }

  let { properties, onChange }: Props = $props();

  function handleInput(key: string, event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const prop = properties.find((p) => p.key === key);
    if (!prop) return;

    let value: string | number | boolean;
    if (prop.type === 'number') {
      value = Number(target.value);
    } else if (prop.type === 'boolean') {
      value = (target as HTMLInputElement).checked;
    } else {
      value = target.value;
    }
    onChange?.(key, value);
  }
</script>

<div class="property-grid">
  {#each properties as prop}
    <label class="prop-label" for={`prop-${prop.key}`}>{prop.label}</label>
    <div class="prop-value">
      {#if prop.type === 'boolean'}
        <input
          id={`prop-${prop.key}`}
          type="checkbox"
          checked={Boolean(prop.value)}
          disabled={prop.readonly}
          onchange={(e) => handleInput(prop.key, e)}
        />
      {:else if prop.type === 'select' && prop.options}
        <select
          id={`prop-${prop.key}`}
          value={String(prop.value)}
          disabled={prop.readonly}
          onchange={(e) => handleInput(prop.key, e)}
        >
          {#each prop.options as opt}
            <option value={opt}>{opt}</option>
          {/each}
        </select>
      {:else if prop.type === 'number'}
        <input
          id={`prop-${prop.key}`}
          type="number"
          value={prop.value}
          disabled={prop.readonly}
          oninput={(e) => handleInput(prop.key, e)}
        />
      {:else}
        <input
          id={`prop-${prop.key}`}
          type="text"
          value={prop.value}
          disabled={prop.readonly}
          oninput={(e) => handleInput(prop.key, e)}
        />
      {/if}
    </div>
  {/each}
</div>

<style>
  .property-grid {
    display: grid;
    grid-template-columns: minmax(120px, auto) 1fr;
    gap: 4px 8px;
    align-items: center;
  }

  .prop-label {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .prop-value input[type='text'],
  .prop-value input[type='number'],
  .prop-value select {
    width: 100%;
    box-sizing: border-box;
    padding: 2px 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    font-family: inherit;
    font-size: inherit;
  }

  .prop-value input:focus,
  .prop-value select:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .prop-value input:disabled,
  .prop-value select:disabled {
    opacity: 0.6;
  }
</style>
